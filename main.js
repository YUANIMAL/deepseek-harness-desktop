'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./lib/config');
const harness = require('./lib/harness');
const git = require('./lib/git');
const backend = require('./lib/backend');
const plugins = require('./lib/plugins');
const credentials = require('./lib/credentials');
const run = require('./lib/run');

const SMOKE = process.env.DSH_DESKTOP_SMOKE === '1';

// Resolve a bundled resource in dev (beside source) or packaged (electron-builder
// asarUnpack places it under app.asar.unpacked). Prefers the unpacked path so it
// is a real filesystem path that an external Node process can spawn/read.
function bundled(rel) {
  const packed = path.join(__dirname, '..', 'app.asar.unpacked', rel);
  if (fs.existsSync(packed)) return packed;
  return path.join(__dirname, rel);
}
const BUNDLED_NODE = bundled(path.join('runtime', 'node'));
// Bundled dsh-agent CLI (see agent/ — copied from the dsh-agent project).
const AGENT_BIN = bundled(path.join('agent', 'bin', 'dsh-agent.mjs'));

let cfg = null;
let harnessPath = null;
let cliBin = null;
let mainWindow = null;
let controlWindow = null;
let backendProc = null;

function log(line) {
  console.log('[dsh-desktop]', line);
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('log', String(line));
  }
}

function backendStatus() {
  return { running: false, owned: !!backendProc, port: cfg.webPort };
}

function agentHome() {
  return process.env.DSH_AGENT_HOME || path.join(app.getPath('home'), '.dsh-agent');
}

function harnessInstallDir() {
  return process.env.DSH_DESKTOP_HARNESS_DIR || path.join(os.homedir(), '.dsh-desktop', 'harness');
}

// Resolve the harness checkout: dev copy → installed (first-run extract) → bundled tar.
async function resolveHarness() {
  const dev = path.join(__dirname, 'harness');
  if (fs.existsSync(path.join(dev, 'apps', 'cli', 'lib', 'bin.js'))) return dev;
  const installed = harnessInstallDir();
  if (fs.existsSync(path.join(installed, 'apps', 'cli', 'lib', 'bin.js'))) return installed;
  const tgz = bundled('harness.tar');
  if (!tgz) return null;
  log('First run: extracting bundled harness (one-time, ~1 min)…');
  fs.mkdirSync(installed, { recursive: true });
  const res = await run.execFilePromise('/usr/bin/tar', ['-xf', tgz, '-C', installed]);
  if (res.code !== 0) {
    log(`extract failed: ${res.stderr || res.stdout}`);
    return null;
  }
  log('Harness ready.');
  return installed;
}

// The harness runtime requires Node >= 22 (Electron 33 bundles Node 20, too
// old), so the app drives dsh-agent with the system Node instead of Electron's.
function resolveNode() {
  const candidates = [
    BUNDLED_NODE,
    process.env.DSH_NODE_BIN,
    path.join(os.homedir(), '.local', 'bin', 'node'),
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    '/usr/bin/node',
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  try {
    const p = String(execFileSync('zsh', ['-lc', 'command -v node'], { encoding: 'utf8' })).trim().split('\n')[0];
    if (p) return p;
  } catch { /* ignore */ }
  return 'node';
}

// Run the bundled dsh-agent CLI (which in turn spawns the DSH runtime).
function spawnAgent(args) {
  return new Promise((resolve) => {
    const child = spawn(resolveNode(), [AGENT_BIN, ...args], {
      env: {
        ...process.env,
        DSH_AGENT_HOME: agentHome(),
        ...(harnessPath ? { DSH_HARNESS: harnessPath } : {}),
      },
    });
    let out = '';
    const emit = (chunk) => {
      const text = String(chunk);
      out += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() !== '') log(line);
      }
    };
    child.stdout.on('data', emit);
    child.stderr.on('data', emit);
    child.on('error', (err) => {
      log(`agent spawn error: ${err.message}`);
      resolve({ code: 1, out });
    });
    child.on('close', (code) => resolve({ code: code == null ? 1 : code, out }));
  });
}

async function startBackend() {
  const port = cfg.webPort;
  const running = await backend.healthCheck(port);
  if (running) {
    log(`Backend already running at http://127.0.0.1:${port} — attaching.`);
    return true;
  }
  if (!cliBin) {
    log('No built CLI found — run `pnpm run build` in the harness checkout first.');
    return false;
  }
  log(`Starting dsh web on port ${port}...`);
  backendProc = backend.start({ cliBin, port, nodeBin: resolveNode() });
  backendProc.stdout.on('data', (d) => log(`[backend] ${String(d).trimEnd()}`));
  backendProc.stderr.on('data', (d) => log(`[backend] ${String(d).trimEnd()}`));
  backendProc.on('close', (code) => {
    log(`Backend exited (code ${code}).`);
    backendProc = null;
  });
  const ok = await backend.waitForPort(port, 30000, () => log(`Waiting for port ${port}...`));
  log(ok ? 'Backend ready.' : `Backend did not answer on port ${port}.`);
  return ok;
}

async function stopBackend() {
  if (!backendProc) {
    log('No backend owned by this app to stop.');
    return;
  }
  log('Stopping backend...');
  await backend.stop(backendProc);
  backendProc = null;
  log('Backend stopped.');
}

async function restartBackend() {
  await stopBackend();
  await startBackend();
}

async function collectState() {
  const gitInfo = harnessPath ? await git.getInfo(harnessPath) : null;
  const installed = plugins.listInstalled(cfg.pluginProfile);
  let catalog = { name: '', source: '', updated: '', categories: {}, plugins: [] };
  if (harnessPath) {
    try {
      catalog = plugins.loadCatalog(harnessPath);
      catalog.plugins = catalog.plugins.map((p) => ({
        ...p,
        installed: plugins.isInstalled(p, installed.deps),
      }));
    } catch (err) {
      catalog.error = err.message || String(err);
    }
  }
  return {
    version: app.getVersion(),
    config: cfg,
    harness: {
      path: harnessPath,
      hasCliBin: !!cliBin,
      cliBin,
    },
    git: gitInfo,
    backend: { ...backendStatus(), running: await backend.healthCheck(cfg.webPort) },
    plugins: {
      profile: cfg.pluginProfile,
      installed,
      catalog,
    },
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560,
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-shell.js'),
    },
  });
  // Load a local shell that health-checks the backend: it redirects to the web
  // UI when up, and shows an offline/recovery screen when down.
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'shell.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Push an app-update event to the Control Center.
function notifyUpdate(channel, payload) {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('update-event', { type: channel, ...(payload || {}) });
  }
}

// Auto-update via electron-updater + GitHub Releases. Requires a SIGNED app on
// macOS (Squirrel verifies the code signature); unsigned/dev builds skip it.
let autoUpdater = null;
function setupAutoUpdate() {
  if (!app.isPackaged) {
    log('Auto-update skipped (dev mode).');
    return;
  }
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    log(`Auto-update unavailable: ${err.message}`);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => notifyUpdate('checking'));
  autoUpdater.on('update-available', (info) => {
    log(`Auto-update: ${info.version} available.`);
    notifyUpdate('available', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => notifyUpdate('not-available'));
  autoUpdater.on('download-progress', (p) => notifyUpdate('progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    log(`Auto-update: ${info.version} downloaded — will install on quit.`);
    notifyUpdate('downloaded', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    log(`Auto-update error: ${err.message} (unsigned builds cannot auto-update).`);
    notifyUpdate('error', { message: err.message });
  });

  // First check shortly after launch, then every 4 hours.
  const check = () => {
    try { autoUpdater.checkForUpdates().catch(() => {}); } catch { /* unsigned */ }
  };
  setTimeout(check, 10000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

// Keep the main window in sync with backend health: show the shell when the
// backend goes down, and return to the web UI when it comes back.
function startHealthMonitor() {
  let wasUp = null;
  setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const up = await backend.healthCheck(cfg.webPort);
    if (wasUp === null) { wasUp = up; return; }
    if (up && !wasUp) {
      mainWindow.loadURL(`http://127.0.0.1:${cfg.webPort}`).catch(() => {});
    } else if (!up && wasUp) {
      mainWindow.loadFile(path.join(__dirname, 'renderer', 'shell.html'));
    }
    wasUp = up;
  }, 3000);
}

function createControlWindow() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.focus();
    return controlWindow;
  }
  controlWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    title: 'DeepSeek Control Center',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  controlWindow.loadFile(path.join(__dirname, 'renderer', 'control.html'));
  controlWindow.on('closed', () => { controlWindow = null; });
  return controlWindow;
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: app.name,
      submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Control Center', accelerator: 'CmdOrCtrl+Shift+P', click: () => createControlWindow() },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open GitHub repository', click: () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness') },
        { label: 'Community plugins', click: () => createControlWindow() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('get-state', () => collectState());

  ipcMain.handle('check-updates', async () => {
    if (!harnessPath) return { ok: false, error: 'No harness checkout found' };
    log('Fetching origin...');
    const res = await git.fetch(harnessPath);
    const info = await git.getInfo(harnessPath);
    if (res.code !== 0) {
      log(`git fetch failed: ${res.stderr}`);
      return { ok: false, git: info, error: res.stderr };
    }
    log(`Checked: ${info.branch} @ ${info.short} — behind ${info.behind ?? '?'}, ahead ${info.ahead ?? '?'}.`);
    return { ok: true, git: info };
  });

  ipcMain.handle('update', async () => {
    if (!harnessPath) return { ok: false, error: 'No harness checkout found' };
    log('=== Update: git fetch ===');
    const fetchRes = await git.fetch(harnessPath);
    if (fetchRes.code !== 0) {
      log(`git fetch failed: ${fetchRes.stderr}`);
      return { ok: false, error: fetchRes.stderr };
    }
    let info = await git.getInfo(harnessPath);
    log(`Current: ${info.branch} @ ${info.short} (behind ${info.behind ?? '?'}, ahead ${info.ahead ?? '?'}).`);
    if ((info.behind ?? 0) === 0) {
      log('Already up to date with origin.');
      return { ok: true, updated: false, git: info };
    }
    log(`=== Update: pulling ${info.behind} commit(s) ===`);
    let pullRes = await git.pull(harnessPath);
    if (pullRes.code !== 0) {
      log(`ff-only pull failed (${pullRes.stderr.trim()}). Falling back to reset --hard.`);
      pullRes = await git.resetHard(harnessPath);
      if (pullRes.code !== 0) {
        log(`reset --hard failed: ${pullRes.stderr}`);
        return { ok: false, error: pullRes.stderr };
      }
    }
    log('=== Update: pnpm install ===');
    const installRes = await run.spawnStreaming('pnpm', ['install'], { cwd: harnessPath, onLine: log });
    if (installRes.code !== 0) {
      log('pnpm install failed.');
      return { ok: false, error: 'pnpm install failed' };
    }
    log('=== Update: pnpm run build ===');
    const buildRes = await run.spawnStreaming('pnpm', ['run', 'build'], { cwd: harnessPath, onLine: log });
    if (buildRes.code !== 0) {
      log('pnpm run build failed.');
      return { ok: false, error: 'pnpm run build failed' };
    }
    cliBin = harness.cliBin(harnessPath);
    log('Update complete. Restarting backend...');
    await restartBackend();
    info = await git.getInfo(harnessPath);
    log(`Now at ${info.branch} @ ${info.short}.`);
    return { ok: true, updated: true, git: info };
  });

  ipcMain.handle('backend-start', async () => { await startBackend(); return collectState(); });
  ipcMain.handle('backend-stop', async () => { await stopBackend(); return collectState(); });
  ipcMain.handle('backend-restart', async () => { await restartBackend(); return collectState(); });
  ipcMain.handle('backend-url', () => `http://127.0.0.1:${cfg.webPort}`);
  ipcMain.handle('open-control', () => { createControlWindow(); return true; });

  ipcMain.handle('update-check', async () => {
    if (!autoUpdater) return { ok: false, error: 'Auto-update unavailable (dev or unsigned build)' };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, info: r && r.updateInfo ? { version: r.updateInfo.version } : null };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('update-install', () => {
    if (!autoUpdater) return { ok: false, error: 'Auto-update unavailable' };
    try {
      autoUpdater.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('plugin-install', async (_e, spec) => {
    if (!cliBin) return { ok: false, error: 'No built CLI found' };
    log(`Installing plugin ${spec} into profile "${cfg.pluginProfile}"...`);
    const args = ['plugin', '--profile', cfg.pluginProfile, 'add', '--ignore-scripts', spec];
    const res = await run.spawnStreaming('node', [cliBin, ...args], { cwd: harnessPath, onLine: log });
    log(res.code === 0 ? `Installed ${spec}.` : `Install failed (code ${res.code}).`);
    return { ok: res.code === 0 };
  });

  ipcMain.handle('plugin-remove', async (_e, packageName) => {
    if (!cliBin) return { ok: false, error: 'No built CLI found' };
    log(`Removing plugin ${packageName} from profile "${cfg.pluginProfile}"...`);
    const args = ['plugin', '--profile', cfg.pluginProfile, 'remove', packageName];
    const res = await run.spawnStreaming('node', [cliBin, ...args], { cwd: harnessPath, onLine: log });
    log(res.code === 0 ? `Removed ${packageName}.` : `Remove failed (code ${res.code}).`);
    return { ok: res.code === 0 };
  });

  ipcMain.handle('agent-run', async (_e, p) => {
    const task = (p && p.task) || '';
    if (!task) return { ok: false, error: 'no task' };
    const args = ['run', task];
    if (p && p.workspace) args.push('--workspace', p.workspace);
    if (p && p.model) args.push('--model', p.model);
    const r = await spawnAgent(args);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('agent-team', async (_e, p) => {
    const goal = (p && p.goal) || '';
    if (!goal) return { ok: false, error: 'no goal' };
    const args = ['team', goal, '--n', String((p && p.n) || 2)];
    if (p && p.broadcast) args.push('--broadcast');
    const r = await spawnAgent(args);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('agent-list', async () => {
    const r = await spawnAgent(['list']);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('agent-spawn', async (_e, p) => {
    const args = ['spawn'];
    if (p && p.name) args.push(p.name);
    if (p && p.workspace) args.push('--workspace', p.workspace);
    const r = await spawnAgent(args);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('agent-ask', async (_e, p) => {
    if (!p || !p.id || !p.prompt) return { ok: false, error: 'need id and prompt' };
    const r = await spawnAgent(['ask', p.id, p.prompt]);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('agent-stop', async (_e, p) => {
    const args = p && p.all ? ['stop', '--all'] : ['stop', p && p.id];
    const r = await spawnAgent(args);
    return { ok: r.code === 0, out: r.out };
  });

  ipcMain.handle('settings-get', () => ({
    ok: true,
    credentials: credentials.readMasked(),
    file: credentials.credentialsFile(),
  }));

  ipcMain.handle('settings-save', (_e, entries) => {
    try {
      const merged = { ...credentials.readFileEntries() };
      for (const [k, v] of Object.entries(entries || {})) {
        if (typeof v === 'string' && v.trim() !== '') merged[k] = v.trim();
        else if (v === '') delete merged[k];
      }
      const file = credentials.write(merged);
      log(`Saved credentials to ${file}`);
      return { ok: true, file, credentials: credentials.readMasked() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('open-external', (_e, url) => shell.openExternal(String(url)));
  ipcMain.handle('open-github', () => shell.openExternal('https://github.com/deepseek-ai/deepseek-harness'));
}

async function init() {
  cfg = config.load();
  harnessPath = (await resolveHarness()) || harness.detectHarnessPath(cfg.harnessPath);
  if (harnessPath && !cfg.harnessPath) {
    cfg.harnessPath = harnessPath;
    config.save(cfg);
  }
  cliBin = harness.cliBin(harnessPath);
  log(`Harness checkout: ${harnessPath || '(none found)'}`);
  log(`Built CLI: ${cliBin || '(missing — run pnpm run build)'}`);

  if (SMOKE) {
    const state = await collectState();
    console.log('SMOKE_STATE=' + JSON.stringify({
      harnessPath,
      hasCliBin: !!cliBin,
      git: state.git,
      backend: state.backend,
      pluginProfile: state.plugins.profile,
      installedCount: state.plugins.installed.deps.length,
      catalogCount: state.plugins.catalog.plugins.length,
      catalogError: state.plugins.catalog.error,
    }, null, 2));
    app.quit();
    return;
  }

  registerIpc();
  buildMenu();
  if (cfg.autoStartBackend) await startBackend();
  createMainWindow();
  startHealthMonitor();
  setupAutoUpdate();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

app.whenReady().then(init);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProc) {
    try { backendProc.kill('SIGTERM'); } catch { /* ignore */ }
  }
});
