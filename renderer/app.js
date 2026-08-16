'use strict';

// Main window: the DeepSeek Harness web UI, full-bleed in a <webview>, with
// connecting/offline overlays. Nothing else.

// `api` is a global binding installed by preload.js
// (contextBridge.exposeInMainWorld). Do NOT re-declare it (`const api = ...`)
// — Electron 33 throws "Identifier 'api' has already been declared", which
// silently kills this whole script. Use the global directly.

const $ = (sel) => document.querySelector(sel);

const webview = $('#webview');
let state = null;
let webviewLoaded = false;
let starting = false;

const webUrl = () => `http://127.0.0.1:${(state && state.config && state.config.webPort) || 3080}`;

async function healthy(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function checkBackend() {
  if (starting) return;
  const url = webUrl();
  if (await healthy(url)) {
    $('#overlay-offline').hidden = true;
    $('#overlay-connecting').hidden = true;
    // Load once, not on every poll: the committed URL gains a trailing slash,
    // so naive string comparison would reload the chat every few seconds.
    if (!webviewLoaded) {
      webviewLoaded = true;
      webview.setAttribute('src', url);
    }
  } else {
    webviewLoaded = false;
    $('#overlay-connecting').hidden = true;
    $('#overlay-offline').hidden = false;
    webview.removeAttribute('src');
  }
}

async function refresh() {
  try {
    state = await api.getState();
  } catch {
    /* backend down is handled by checkBackend */
  }
}

$('#btn-backend-start').addEventListener('click', async () => {
  starting = true;
  $('#overlay-offline').hidden = true;
  $('#overlay-connecting').hidden = false;
  try {
    await api.backendStart();
    for (let i = 0; i < 60; i++) {
      if (await healthy(webUrl())) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await refresh();
  } finally {
    starting = false;
  }
  await checkBackend();
});

webview.addEventListener('new-window', (e) => {
  if (e && e.url && /^https?:/.test(e.url)) api.openExternal(e.url);
});

refresh();
checkBackend();
setInterval(checkBackend, 4000);
setInterval(() => refresh().catch(() => {}), 10000);
