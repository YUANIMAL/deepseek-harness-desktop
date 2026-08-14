'use strict';

// Main-window shell: embeds the DSH web UI in a <webview>, keeps a plugins
// drawer, and owns the backend offline/recovery UX.

const api = window.api;
let state = null;
let liveCatalog = null;
let pluginFilter = { q: '', category: 'all' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, v) => window.t(k, v);

const webview = $('#webview');

const webUrl = () => `http://127.0.0.1:${(state && state.config && state.config.webPort) || 3080}`;

function desc(p) {
  const d = p.description || {};
  return d[window.__lang] || d.en || d.zh || '';
}

function liveInstalled(p) {
  const target = String(p.name).toLowerCase();
  const deps = (state && state.plugins && state.plugins.installed && state.plugins.installed.deps) || [];
  return deps.some((n) => {
    const name = String(n).toLowerCase();
    return name === target || name.endsWith(`/${target}`);
  });
}

function renderPlugins() {
  if (!state) return;
  const catalog = state.plugins.catalog || { plugins: [], categories: {} };

  const sel = $('#pl-category');
  sel.innerHTML = `<option value="all">${esc(t('plugins.allCategories'))}</option>`;
  for (const [key, labels] of Object.entries(catalog.categories || {})) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = labels[window.__lang] || labels.en || key;
    sel.append(opt);
  }
  sel.value = pluginFilter.category;

  const bundled = (catalog.plugins || []).map((p) => ({ ...p }));
  const bundledSpecs = new Set(bundled.map((p) => String(p.spec).toLowerCase()));
  const liveExtra = (liveCatalog || [])
    .filter((p) => !bundledSpecs.has(String(p.spec).toLowerCase()))
    .map((p) => ({ ...p, installed: liveInstalled(p) }));
  const all = [...bundled, ...liveExtra];

  const q = pluginFilter.q.toLowerCase();
  const list = all.filter((p) =>
    (pluginFilter.category === 'all' || p.category === pluginFilter.category) &&
    (!q || p.name.toLowerCase().includes(q) || desc(p).toLowerCase().includes(q))
  );

  $('#pl-count').textContent = t('plugins.count', { n: list.length, t: all.length });

  const ul = $('#pl-list');
  ul.innerHTML = '';
  for (const p of list) {
    const li = document.createElement('li');
    const stars = p.stars ? `<span class="muted">\u2b50 ${p.stars}</span>` : '';
    const liveBadge = p.live ? `<span class="badge">${esc(t('plugins.live'))}</span>` : '';
    const badge = p.installed
      ? `<span class="badge installed">${esc(t('plugins.installed'))}</span>`
      : `<span class="badge">${esc(p.category)}</span>`;
    const action = p.installed
      ? `<button class="btn btn-mini" data-action="remove" data-name="${esc(p.name)}">${esc(t('plugins.remove'))}</button>`
      : `<button class="btn btn-mini" data-action="install" data-spec="${esc(p.spec)}">${esc(t('plugins.install'))}</button>`;
    li.innerHTML = `
      <div class="plugin-main">
        <div class="plugin-title">
          <span class="plugin-name">${esc(p.name)}</span>
          <span class="plugin-owner">${esc(p.owner)}</span>
          ${stars}${liveBadge}${badge}
        </div>
        <p class="plugin-desc">${esc(desc(p))}</p>
      </div>
      <div class="plugin-actions">
        <button class="btn btn-mini" data-action="open" data-url="${esc(p.url)}">GitHub</button>
        ${action}
      </div>`;
    ul.append(li);
  }
}

async function fetchLivePlugins() {
  const statusEl = $('#pl-live-status');
  statusEl.textContent = t('plugins.fetching');
  try {
    const results = [];
    for (const page of [1, 2]) {
      const res = await fetch(`https://api.github.com/search/repositories?q=topic:dsh-plugin&sort=updated&per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      results.push(...(data.items || []));
    }
    liveCatalog = results.map((r) => ({
      name: r.name,
      owner: r.owner ? r.owner.login : '',
      url: r.html_url,
      category: 'live',
      description: { en: r.description || '', zh: '' },
      stars: r.stargazers_count || 0,
      spec: `github:${r.owner ? r.owner.login : ''}/${r.name}`,
      live: true,
    }));
    renderPlugins();
    statusEl.textContent = t('plugins.liveCount', { n: liveCatalog.length });
  } catch (err) {
    statusEl.textContent = t('plugins.liveFailed', { m: err.message });
  }
}

async function refresh() {
  try {
    state = await api.getState();
    const lang = state.config && state.config.language;
    if (lang && lang !== window.__lang) {
      window.applyI18n(lang);
      $('#lang-select').value = lang;
    }
    updateChip();
    renderPlugins();
  } catch { /* backend down is handled by checkBackend */ }
}

function updateChip() {
  const el = $('#backend-chip');
  if (!state) { el.textContent = '\u2014'; el.className = 'chip'; return; }
  const running = state.backend.running;
  el.textContent = `${t('chip.backend')}: ${running ? t('status.running') : t('status.stopped')}`;
  el.className = 'chip ' + (running ? 'ok' : 'bad');
}

async function healthy(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    return r.status < 500;
  } catch {
    return false;
  }
}

async function checkBackend() {
  const url = webUrl();
  if (await healthy(url)) {
    $('#overlay-offline').hidden = true;
    $('#overlay-connecting').hidden = true;
    if (webview.getAttribute('src') !== url) webview.setAttribute('src', url);
  } else {
    $('#overlay-connecting').hidden = true;
    $('#overlay-offline').hidden = false;
    webview.removeAttribute('src');
  }
}

function togglePanel(open) {
  const panel = $('#plugin-panel');
  const show = open !== undefined ? open : panel.hidden;
  panel.hidden = !show;
  $('#btn-plugins').classList.toggle('active', show);
}

// --- wiring ---
$('#btn-plugins').addEventListener('click', () => togglePanel());
$('#btn-panel-close').addEventListener('click', () => togglePanel(false));
$('#btn-control').addEventListener('click', () => api.openControl());
$('#btn-offline-control').addEventListener('click', () => api.openControl());

$('#btn-backend-start').addEventListener('click', async () => {
  $('#overlay-offline').hidden = true;
  $('#overlay-connecting').hidden = false;
  await api.backendStart();
  for (let i = 0; i < 60; i++) {
    if (await healthy(webUrl())) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await checkBackend();
  await refresh();
});

$('#lang-select').addEventListener('change', async (e) => {
  window.applyI18n(e.target.value);
  await api.setLanguage(e.target.value);
  await refresh();
});

$('#pl-search').addEventListener('input', (e) => { pluginFilter.q = e.target.value; renderPlugins(); });
$('#pl-category').addEventListener('change', (e) => { pluginFilter.category = e.target.value; renderPlugins(); });
$('#btn-plugins-live').addEventListener('click', fetchLivePlugins);

$('#pl-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;
  if (action === 'open') {
    api.openExternal(btn.dataset.url);
  } else if (action === 'install') {
    await api.pluginInstall(btn.dataset.spec);
    await refresh();
  } else if (action === 'remove') {
    await api.pluginRemove(btn.dataset.name);
    await refresh();
  }
});

webview.addEventListener('new-window', (e) => {
  if (e && e.url && /^https?:/.test(e.url)) api.openExternal(e.url);
});

// --- init ---
window.applyI18n(window.__lang || 'en');
refresh();
checkBackend();
setInterval(checkBackend, 4000);
setInterval(() => refresh().catch(() => {}), 10000);
