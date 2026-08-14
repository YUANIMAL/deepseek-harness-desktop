'use strict';

// Persisted app settings, stored in ~/.dsh-desktop/config.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Overridable via DSH_DESKTOP_CONFIG_DIR (useful for testing / portable installs).
const CONFIG_DIR = process.env.DSH_DESKTOP_CONFIG_DIR || path.join(os.homedir(), '.dsh-desktop');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  harnessPath: '', // empty => auto-detect
  webPort: 3080,
  pluginProfile: 'web',
  autoStartBackend: true,
  autoUpdateOnLaunch: false,
  gitRemote: 'https://github.com/deepseek-ai/deepseek-harness.git',
};

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(config) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const tmp = `${CONFIG_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmp, CONFIG_FILE);
    return true;
  } catch (err) {
    // Never let a config-write failure crash startup.
    console.error('[dsh-desktop] config save failed:', err.message);
    return false;
  }
}

module.exports = { load, save, CONFIG_FILE, DEFAULTS };
