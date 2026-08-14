'use strict';

// Render the DeepSeek whale logo (from the harness favicon.svg path) onto a
// DeepSeek-blue gradient at 1024x1024 — pure Node, no GUI, no deps.
//   node scripts/gen-icon.js [path/to/favicon.svg]
// Output: assets/icon-1024.png (then build-icns.sh turns it into icon.icns).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 1024; // output size
const SS = 2; // supersampling factor for anti-aliasing
const R = S * SS; // render resolution

const SVG_DEFAULT = path.join(__dirname, '..', 'assets', 'deepseek-whale.svg');
const svgFile = process.argv[2] || SVG_DEFAULT;

// --- read + extract the path `d` ---
const svgText = fs.readFileSync(svgFile, 'utf8');
const dm = /<path[^>]*\bd="([^"]+)"/.exec(svgText) || /\bd="([^"]+)"/.exec(svgText);
if (!dm) throw new Error(`no path d found in ${svgFile}`);
const d = dm[1];

// --- parse absolute M / C / L / Z into subpaths of cubic segments ---
function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);
  const subpaths = [];
  let cur = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'M') {
      const x = num(), y = num();
      if (cur) subpaths.push(cur);
      cur = [];
      cx = x; cy = y; sx = x; sy = y;
    } else if (t === 'C') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      cur.push([cx, cy, x1, y1, x2, y2, x, y]);
      cx = x; cy = y;
    } else if (t === 'L') {
      const x = num(), y = num();
      cur.push([cx, cy, cx, cy, x, y, x, y]);
      cx = x; cy = y;
    } else if (t === 'Z') {
      cur.push([cx, cy, cx, cy, sx, sy, sx, sy]);
      cx = sx; cy = sy;
    }
    // lowercase commands are not used by this asset; ignore.
  }
  if (cur) subpaths.push(cur);
  return subpaths;
}

function cubic(p, t) {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, e = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + e * p[6], a * p[1] + b * p[3] + c * p[5] + e * p[7]];
}

// Flatten every cubic into line segments and collect edges + bounding box.
function buildEdges(subpaths, segments) {
  const edges = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const push = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const sp of subpaths) {
    for (const seg of sp) {
      let px = null, py = null;
      for (let k = 0; k <= segments; k++) {
        const [x, y] = cubic(seg, k / segments);
        push(x, y);
        if (px !== null) edges.push([px, py, x, y]);
        px = x; py = y;
      }
    }
  }
  return { edges, minX, minY, maxX, maxY };
}

const subpaths = parsePath(d);
const { edges, minX, minY, maxX, maxY } = buildEdges(subpaths, 30);

// Map the whale's viewBox bbox into a centered box (~68% of the canvas).
const T = R * 0.68;
const w = maxX - minX, h = maxY - minY;
const scale = Math.min(T / w, T / h);
const ox = (R - w * scale) / 2;
const oy = (R - h * scale) / 2;
const X = (x) => ox + (x - minX) * scale;
const Y = (y) => oy + (y - minY) * scale;

const mapped = edges.map((e) => [X(e[0]), Y(e[1]), X(e[2]), Y(e[3])]);

// --- colors ---
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
const top = hex('#5b7cff');
const bottom = hex('#3b56d6');
function bg(x, y) {
  const t = (x + y) / (2 * (R - 1));
  return [
    Math.round(top[0] + (bottom[0] - top[0]) * t),
    Math.round(top[1] + (bottom[1] - top[1]) * t),
    Math.round(top[2] + (bottom[2] - top[2]) * t),
  ];
}

// --- rasterize: background + even-odd scanline fill of the whale ---
const rowBytes = R * 4;
const raw = Buffer.alloc((rowBytes + 1) * R);

// background
for (let y = 0; y < R; y++) {
  raw[y * (rowBytes + 1)] = 0;
  const c = bg(0, y);
  for (let x = 0; x < R; x++) {
    const cc = bg(x, y);
    const o = y * (rowBytes + 1) + 1 + x * 4;
    raw[o] = cc[0]; raw[o + 1] = cc[1]; raw[o + 2] = cc[2]; raw[o + 3] = 255;
  }
}

// whale fill (even-odd): per scanline, intersect edges, sort, fill spans
for (let y = 0; y < R; y++) {
  const xs = [];
  for (const e of mapped) {
    const [x1, y1, x2, y2] = e;
    if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
      xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  const base = y * (rowBytes + 1) + 1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    let x0 = Math.max(0, Math.round(xs[i]));
    const x1 = Math.min(R - 1, Math.round(xs[i + 1]));
    for (let x = x0; x <= x1; x++) {
      const o = base + x * 4;
      raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; raw[o + 3] = 255;
    }
  }
}

// --- macOS squircle mask: rounded corners with transparent outside ---
// Superellipse |u|^n + |v|^n <= 1 (n≈5 approximates the native icon squircle).
const N = 5;
function insideSquircle(x, y) {
  const u = (x - R / 2) / (R / 2);
  const v = (y - R / 2) / (R / 2);
  return Math.pow(Math.abs(u), N) + Math.pow(Math.abs(v), N) <= 1;
}
for (let y = 0; y < R; y++) {
  for (let x = 0; x < R; x++) {
    if (!insideSquircle(x, y)) {
      raw[y * (rowBytes + 1) + 1 + x * 4 + 3] = 0;
    }
  }
}

// --- downsample SS×SS → S (averaging rgb and alpha for a smooth edge) ---
const outRowBytes = S * 4;
const out = Buffer.alloc((outRowBytes + 1) * S);
for (let y = 0; y < S; y++) {
  out[y * (outRowBytes + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const o = (y * SS + sy) * (rowBytes + 1) + 1 + (x * SS + sx) * 4;
        r += raw[o]; g += raw[o + 1]; b += raw[o + 2]; a += raw[o + 3];
      }
    }
    const n = SS * SS;
    const o = y * (outRowBytes + 1) + 1 + x * 4;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
  }
}

// --- PNG encode ---
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
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const outp = path.join(__dirname, '..', 'assets', 'icon-1024.png');
fs.writeFileSync(outp, png);
console.log(`wrote ${outp} (${png.length} bytes, whale bbox ${Math.round(minX)},${Math.round(minY)}..${Math.round(maxX)},${Math.round(maxY)})`);
