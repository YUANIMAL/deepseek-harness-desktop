// Rasterize the DeepSeek whale logo (favicon.svg) onto a DeepSeek-blue rounded
// background at 1024x1024, using Electron's offscreen renderer. Run with:
//   ./node_modules/.bin/electron --no-sandbox --disable-gpu scripts/rasterize-icon.mjs
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC_SVG = process.argv[2] || '/Users/yuanzhanghao/deepseek-harness/apps/web/public/favicon.svg';
const OUT = path.join(__dirname, '..', 'assets', 'icon-1024.png');
const SIZE = 1024;

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SRC_SVG, 'utf8');
  // Force a single white whale regardless of the source's dark-mode media query.
  const clean = svg.replace(/<style>[\s\S]*?<\/style>/, '<style>path{fill:#ffffff}</style>');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="margin:0">
    <div style="width:${SIZE}px;height:${SIZE}px;background:linear-gradient(160deg,#5b7cff 0%,#4d6bfe 55%,#3b56d6 100%);display:flex;align-items:center;justify-content:center">
      <div style="width:${Math.round(SIZE * 0.66)}px;height:${Math.round(SIZE * 0.66)}px">${clean}</div>
    </div>
  </body></html>`;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log(`wrote ${OUT} (${img.getSize().width}x${img.getSize().height})`);
  app.quit();
});
