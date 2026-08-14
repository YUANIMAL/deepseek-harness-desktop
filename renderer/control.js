'use strict';

const api = window.api;
let state = null;
let pluginFilter = { q: '', category: 'all' };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (k, v) => window.t(k, v);

function log(line) {
  const el = $('#log');
  el.textContent += `${line}\n`;
  while (el.textContent.split('\n').length > 600) {
    el.textContent = el.textContent.slice(el.textContent.indexOf('\n') + 1);
  }
  el.scrollTop = el.scrollHeight;
}
api.onLog(log);

async function refresh() {
  try {
    state = await api.getState();
    const cfgLang = state.config && state.config.language;
    if (cfgLang && cfgLang !== window.__lang) {
      window.applyI18n(cfgLang);
      $('#lang-select').value = cfgLang;
      $('#lang-select-settings').value = cfgLang;
    }
    render();
  } catch (err) {
    log(`get-state failed: ${err.message}`);
  }
}

function desc(plugin) {
  const d = plugin.description || {};
  return d[window.__lang] || d.en || d.zh || '';
}

function render() {
  if (!state) return;
  renderHeader();
  renderOverview();
  renderUpdates();
  renderPlugins();
}

function renderHeader() {
  $('#harness-path').textContent = state.harness.path || t('overview.noHarness');
  const chipBackend = $('#chip-backend');
  const running = state.backend.running;
  chipBackend.textContent = `${t('chip.backend')}: ${running ? t('status.running') : t('status.stopped')}`;
  chipBackend.className = 'chip ' + (running ? 'ok' : 'bad');

  const git = state.git;
  const chipGit = $('#chip-git');
  if (git && git.ok) {
    chipGit.textContent = `git: ${git.branch}@${git.short} (\u2193${git.behind ?? '?'} \u2191${git.ahead ?? '?'})`;
    chipGit.className = 'chip ' + ((git.behind ?? 0) === 0 ? 'ok' : 'bad');
  } else {
    chipGit.textContent = t('git.unavailable');
    chipGit.className = 'chip bad';
  }
}

function renderOverview() {
  $('#ov-path').textContent = state.harness.path || t('overview.notFound');
  $('#ov-cli').textContent = state.harness.hasCliBin ? state.harness.cliBin : t('overview.missingCli');
  const git = state.git;
  $('#ov-commit').textContent = git && git.ok ? `${git.branch} @ ${git.short} (${git.commit})` : t('overview.unavailable');
  $('#ov-sync').textContent = git && git.ok
    ? `${t('sync.behind', { b: git.behind ?? '?', a: git.ahead ?? '?' })}, ${git.clean ? t('sync.clean') : t('sync.dirty')}`
    : t('overview.unavailable');
  $('#ov-url').textContent = `http://127.0.0.1:${state.config.webPort}`;
  $('#ov-backend').textContent = state.backend.running
    ? `${t('status.running')}${state.backend.owned ? ' ' + t('status.owned') : ' ' + t('status.external')}`
    : t('status.stopped');
  $('#ov-profile').textContent = state.plugins.profile;
}

function renderUpdates() {
  $('#up-current').textContent = state.version || '\u2014';
}

function renderPlugins() {
  const catalog = state.plugins.catalog;
  const sel = $('#pl-category');
  sel.innerHTML = `<option value="all">${esc(t('plugins.allCategories'))}</option>`;
  for (const [key, labels] of Object.entries(catalog.categories || {})) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = labels[window.__lang] || labels.en || key;
    sel.append(opt);
  }
  sel.value = pluginFilter.category;

  const profileSel = $('#pl-profile');
  profileSel.innerHTML = '';
  for (const p of ['web', 'web-community']) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = t('plugins.profile', { p });
    profileSel.append(opt);
  }
  profileSel.value = state.plugins.profile;
  profileSel.disabled = true; // profile is app-level config for now

  const q = pluginFilter.q.toLowerCase();
  const list = catalog.plugins.filter((p) =>
    (pluginFilter.category === 'all' || p.category === pluginFilter.category) &&
    (!q || p.name.toLowerCase().includes(q) || desc(p).toLowerCase().includes(q))
  );

  $('#pl-count').textContent = t('plugins.count', { n: list.length, t: catalog.plugins.length });

  const ul = $('#pl-list');
  ul.innerHTML = '';
  for (const p of list) {
    const li = document.createElement('li');
    const badge = p.installed
      ? `<span class="badge installed">${esc(t('plugins.installed'))}</span>`
      : `<span class="badge">${esc(p.category)}</span>`;
    const action = p.installed
      ? `<button class="btn" data-action="remove" data-name="${esc(p.name)}">${esc(t('plugins.remove'))}</button>`
      : `<button class="btn" data-action="install" data-spec="${esc(p.spec)}">${esc(t('plugins.install'))}</button>`;
    li.innerHTML = `
      <div class="plugin-main">
        <div class="plugin-title">
          <span class="plugin-name">${esc(p.name)}</span>
          <span class="plugin-owner">${esc(p.owner)}</span>
          ${badge}
        </div>
        <p class="plugin-desc">${esc(desc(p))}</p>
      </div>
      <div class="plugin-actions">
        <button class="btn" data-action="open" data-url="${esc(p.url)}">GitHub</button>
        ${action}
      </div>`;
    ul.append(li);
  }
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.id === `tab-${name}`));
}

function setBusy(on) {
  document.querySelectorAll('.btn').forEach((b) => (b.disabled = on));
}

async function act(fn) {
  setBusy(true);
  try {
    await fn();
  } catch (err) {
    log(`error: ${err.message}`);
  }
  setBusy(false);
  await refresh();
}

// --- language switching ---
async function setLanguage(lang) {
  window.applyI18n(lang);
  $('#lang-select').value = lang;
  $('#lang-select-settings').value = lang;
  render();
  try { await api.setLanguage(lang); } catch { /* ignore */ }
}

// --- wiring ---
document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
  switchTab(b.dataset.tab);
  if (b.dataset.tab === 'settings') loadSettings();
}));

$('#lang-select').addEventListener('change', (e) => setLanguage(e.target.value));
$('#lang-select-settings').addEventListener('change', (e) => setLanguage(e.target.value));

$('#btn-open-github').addEventListener('click', () => api.openGitHub());
$('#btn-open-web').addEventListener('click', () => api.openExternal(`http://127.0.0.1:${state.config.webPort}`));
$('#btn-backend-start').addEventListener('click', () => act(() => api.backendStart()));
$('#btn-backend-stop').addEventListener('click', () => act(() => api.backendStop()));
$('#btn-backend-restart').addEventListener('click', () => act(() => api.backendRestart()));

$('#btn-check').addEventListener('click', async () => {
  $('#up-status').textContent = t('updates.checking');
  const r = await api.updateCheck();
  if (!r.ok) {
    $('#up-status').textContent = t('updates.unavailable.short', { m: r.error });
  } else if (r.info) {
    $('#up-status').textContent = t('updates.available', { v: r.info.version });
  } else {
    $('#up-status').textContent = t('updates.uptodate');
  }
});

$('#btn-install').addEventListener('click', () => api.updateInstall());

api.onUpdateEvent((e) => {
  if (e.type === 'checking') $('#up-status').textContent = t('updates.checking');
  else if (e.type === 'available') $('#up-status').textContent = t('updates.available', { v: e.version });
  else if (e.type === 'not-available') $('#up-status').textContent = t('updates.uptodate');
  else if (e.type === 'progress') $('#up-status').textContent = t('updates.progress', { p: e.percent });
  else if (e.type === 'downloaded') {
    $('#up-status').textContent = t('updates.downloaded', { v: e.version });
    $('#btn-install').disabled = false;
  } else if (e.type === 'error') {
    $('#up-status').textContent = t('updates.unavailable', { m: e.message || 'unsigned build' });
  }
});

$('#pl-search').addEventListener('input', (e) => { pluginFilter.q = e.target.value; renderPlugins(); });
$('#pl-category').addEventListener('change', (e) => { pluginFilter.category = e.target.value; renderPlugins(); });
$('#btn-clear-log').addEventListener('click', () => { $('#log').textContent = ''; });

$('#pl-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;
  if (action === 'open') {
    api.openExternal(btn.dataset.url);
  } else if (action === 'install') {
    setBusy(true);
    await api.pluginInstall(btn.dataset.spec);
    setBusy(false);
    await refresh();
  } else if (action === 'remove') {
    setBusy(true);
    await api.pluginRemove(btn.dataset.name);
    setBusy(false);
    await refresh();
  }
});

// --- Local Agents ---
async function agentOp(fn, outEl) {
  document.body.classList.add('busy');
  setBusy(true);
  if (outEl) outEl.textContent = t('agents.runningDots');
  try {
    const r = await fn();
    if (outEl) outEl.textContent = r.out || (r.ok ? t('status.done') : t('status.failed'));
  } catch (err) {
    if (outEl) outEl.textContent = t('error', { m: err.message });
  }
  setBusy(false);
  document.body.classList.remove('busy');
}

$('#btn-agent-run').addEventListener('click', () => agentOp(
  () => api.agentRun({ task: $('#agent-goal').value.trim(), workspace: $('#agent-workspace').value.trim() || undefined }),
  $('#agent-out'),
));

$('#btn-agent-team').addEventListener('click', () => agentOp(
  () => api.agentTeam({
    goal: $('#agent-goal').value.trim(),
    n: parseInt($('#agent-n').value, 10) || 2,
    broadcast: $('#agent-broadcast').checked,
    workspace: $('#agent-workspace').value.trim() || undefined,
  }),
  $('#agent-out'),
));

$('#btn-agent-list').addEventListener('click', () => agentOp(() => api.agentList(), $('#agent-out')));
$('#btn-agent-stop').addEventListener('click', () => agentOp(() => api.agentStop({ all: true }), $('#agent-out')));

// --- Settings (API credentials) ---
const MASK = '\u2022\u2022\u2022\u2022';

async function loadSettings() {
  try {
    const r = await api.settingsGet();
    $('#settings-file').textContent = r.file || '';
    const c = r.credentials || {};
    $('#s-deepseek-key').value = '';
    $('#s-deepseek-key').placeholder = c.DEEPSEEK_API_KEY ? t('settings.current', { m: c.DEEPSEEK_API_KEY }) : 'sk-\u2026';
    $('#s-deepseek-url').value = c.DEEPSEEK_BASE_URL || '';
    const extras = [];
    for (const [k, v] of Object.entries(c)) {
      if (k === 'DEEPSEEK_API_KEY' || k === 'DEEPSEEK_BASE_URL') continue;
      extras.push(`${k}=${v || ''}`);
    }
    $('#s-extra').value = extras.join('\n');
    $('#settings-status').textContent = '';
  } catch (err) {
    $('#settings-status').textContent = t('error', { m: err.message });
  }
}

$('#btn-settings-save').addEventListener('click', async () => {
  const entries = {};
  const key = $('#s-deepseek-key').value.trim();
  if (key) entries.DEEPSEEK_API_KEY = key;
  const url = $('#s-deepseek-url').value.trim();
  if (url) entries.DEEPSEEK_BASE_URL = url;
  for (const line of $('#s-extra').value.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const val = m[2].trim();
    if (val && !val.includes(MASK)) entries[m[1]] = val;
  }
  try {
    const r = await api.settingsSave(entries);
    $('#settings-status').textContent = r.ok ? t('settings.saved', { file: r.file }) : t('error', { m: r.error });
    if (r.ok) await loadSettings();
  } catch (err) {
    $('#settings-status').textContent = t('error', { m: err.message });
  }
});

refresh();
setInterval(() => {
  if (!document.body.classList.contains('busy')) refresh();
}, 5000);
