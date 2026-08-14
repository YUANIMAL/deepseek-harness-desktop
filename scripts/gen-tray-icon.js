'use strict';

// Generate a monochrome whale tray icon (black silhouette on transparent) at a
// Retina-friendly size, from the whale path in assets/deepseek-whale.svg.
//   node scripts/gen-tray-icon.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 36; // output px (18pt @2x)
const SVG = path.join(__dirname, '..', 'assets', 'deepseek-whale.svg');

const svg = fs.readFileSync(SVG, 'utf8');
const dm = /<path[^>]*\bd="([^"]+)"/.exec(svg) || /\bd="([^"]+)"/.exec(svg);
if (!dm) throw new Error('no path d in ' + SVG);
const d = dm[1];

function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
  const subpaths = [];
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0, i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'M') {
      const x = num(), y = num();
      if (cur) subpaths.push(cur);
      cur = []; cx = x; cy = y; sx = x; sy = y;
    } else if (t === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      cur.push([cx, cy, x1, y1, x2, y2, x, y]); cx = x; cy = y;
    } else if (t === 'L') {
      const x = num(), y = num();
      cur.push([cx, cy, cx, cy, x, y, x, y]); cx = x; cy = y;
    } else if (t === 'Z') {
      cur.push([cx, cy, cx, cy, sx, sy, sx, sy]); cx = sx; cy = sy;
    }
  }
  if (cur) subpaths.push(cur);
  return subpaths;
}

function cubic(p, t) {
  const mt = 1 - t;
  return [
    mt * mt * mt * p[0] + 3 * mt * mt * t * p[2] + 3 * mt * t * t * p[4] + t * t * t * p[6],
    mt * mt * mt * p[1] + 3 * mt * mt * t * p[3] + 3 * mt * t * t * p[5] + t * t * t * p[7],
  ];
}

const subpaths = parsePath(d);
const SEG = 24;
const edges = [];
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const sp of subpaths) {
  for (const seg of sp) {
    let px = null, py = null;
    for (let k = 0; k <= SEG; k++) {
      const [x, y] = cubic(seg, k / SEG);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (px !== null) edges.push([px, py, x, y]);
      px = x; py = y;
    }
  }
}

const R = SIZE * 2; // supersample for AA
const w = maxX - minX, h = maxY - minY;
const scale = Math.min((R * 0.92) / w, (R * 0.92) / h);
const ox = (R - w * scale) / 2, oy = (R - h * scale) / 2;
const mapped = edges.map((e) => [
  ox + (e[0] - minX) * scale, oy + (e[1] - minY) * scale,
  ox + (e[2] - minX) * scale, oy + (e[3] - minY) * scale,
]);

const rowBytes = R * 4;
const raw = Buffer.alloc((rowBytes + 1) * R);
for (let y = 0; y < R; y++) {
  raw[y * (rowBytes + 1)] = 0;
  const xs = [];
  for (const [x1, y1, x2, y2] of mapped) {
    if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
  }
  xs.sort((a, b) => a - b);
  const base = y * (rowBytes + 1) + 1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const x0 = Math.max(0, Math.round(xs[i]));
    const x1 = Math.min(R - 1, Math.round(xs[i + 1]));
    for (let x = x0; x <= x1; x++) {
      const o = base + x * 4;
      raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = 255;
    }
  }
}

const outRowBytes = SIZE * 4;
const out = Buffer.alloc((outRowBytes + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  out[y * (outRowBytes + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    let a = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      a += raw[(y * 2 + sy) * (rowBytes + 1) + 1 + (x * 2 + sx) * 4 + 3];
    }
    const o = y * (outRowBytes + 1) + 1 + x * 4;
    out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = Math.round(a / 4);
  }
}

// PNG encode
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outp = path.join(__dirname, '..', 'assets', 'trayTemplate.png');
fs.writeFileSync(outp, png);
console.log(`wrote ${outp} (${SIZE}x${SIZE}, ${png.length} bytes)`);
