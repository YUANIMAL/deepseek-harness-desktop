'use strict';

// Locate the DeepSeek Harness source checkout and its built CLI entry.

const fs = require('fs');
const os = require('os');
const path = require('path');

function isHarnessRoot(p) {
  if (!p) return false;
  return (
    fs.existsSync(path.join(p, 'package.json')) &&
    fs.existsSync(path.join(p, 'apps', 'cli'))
  );
}

const CANDIDATES = [
  () => process.env.DSH_HARNESS || '',
  () => path.join(os.homedir(), 'deepseek-harness'),
];

// Preferred path wins when it is a valid harness root; otherwise scan candidates.
function detectHarnessPath(preferred) {
  if (isHarnessRoot(preferred)) return path.resolve(preferred);
  for (const c of CANDIDATES) {
    const p = c();
    if (isHarnessRoot(p)) return path.resolve(p);
  }
  return null;
}

// Built CLI entry (apps/cli/lib/bin.js). Prefer it — no tsx loader needed.
function cliBin(harnessPath) {
  if (!harnessPath) return null;
  const built = path.join(harnessPath, 'apps', 'cli', 'lib', 'bin.js');
  return fs.existsSync(built) ? built : null;
}

function sourceBin(harnessPath) {
  return harnessPath ? path.join(harnessPath, 'apps', 'cli', 'src', 'bin.ts') : null;
}

function catalogFile(harnessPath) {
  return harnessPath ? path.join(harnessPath, 'community-plugins', 'plugins.json') : null;
}

module.exports = { isHarnessRoot, detectHarnessPath, cliBin, sourceBin, catalogFile };
