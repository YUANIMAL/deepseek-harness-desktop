'use strict';

// Community plugin catalog + install/list/remove via `dsh plugin`.
// The catalog ships in the harness checkout at community-plugins/plugins.json.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFilePromise } = require('./run');

function profileDir(profile) {
  return path.join(os.homedir(), '.dsh', 'profiles', profile || 'web');
}

function readProfileManifest(profile) {
  const file = path.join(profileDir(profile), 'package.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Installed community-plugin package names (dependencies) for a profile.
function listInstalled(profile) {
  const manifest = readProfileManifest(profile);
  const deps = manifest && manifest.dependencies ? Object.keys(manifest.dependencies) : [];
  const bundles = manifest && manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles
    ? manifest.dsh.profile.bundles
    : [];
  return { deps, bundles, profile, dir: profileDir(profile) };
}

function loadCatalog(harnessPath) {
  const file = path.join(harnessPath, 'community-plugins', 'plugins.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const plugins = (raw.plugins || []).map((p) => ({
    name: p.name,
    owner: p.owner,
    url: p.url,
    category: p.category,
    description: p.description || {},
    added: p.added,
    spec: `github:${p.owner}/${p.name}`,
  }));
  return {
    name: raw.name,
    source: raw.source,
    updated: raw.updated,
    categories: raw.categories || {},
    plugins,
  };
}

// Match a catalog plugin against installed package names. The npm package name
// may be scoped (e.g. `@bill9109/dsh-conversation-share`), so match on the
// unscoped basename, case-insensitively (some repos use mixed case).
function isInstalled(plugin, installedNames) {
  const target = String(plugin.name).toLowerCase();
  return installedNames.some((n) => {
    const name = String(n).toLowerCase();
    return name === target || name.endsWith(`/${target}`);
  });
}

// Run `node <cliBin> plugin --profile <profile> <args...>`.
async function runDshPlugin(cliBin, profile, args, opts = {}) {
  const fullArgs = ['plugin', '--profile', profile, ...args];
  return execFilePromise('node', [cliBin, ...fullArgs], {
    cwd: opts.cwd,
    env: opts.env || process.env,
    maxBuffer: opts.maxBuffer || 128 * 1024 * 1024,
    timeout: opts.timeout || 0,
  });
}

function install(cliBin, profile, spec, opts = {}) {
  const args = ['add'];
  if (opts.ignoreScripts !== false) args.push('--ignore-scripts');
  args.push(spec);
  return runDshPlugin(cliBin, profile, args, opts);
}

function remove(cliBin, profile, packageName, opts = {}) {
  return runDshPlugin(cliBin, profile, ['remove', packageName], opts);
}

module.exports = {
  profileDir,
  readProfileManifest,
  listInstalled,
  loadCatalog,
  isInstalled,
  runDshPlugin,
  install,
  remove,
};
