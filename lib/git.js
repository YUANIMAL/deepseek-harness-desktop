'use strict';

// Git operations against the harness checkout. Every command is read-only
// except pull()/resetHard()/clone(), which are explicit.

const { execFilePromise } = require('./run');

async function run(cwd, args) {
  return execFilePromise('git', args, { cwd });
}

// branch / commit / short hash / remote URL. ahead/behind computed against the
// local origin/<branch> ref (no network) and returned as numbers or null.
async function getInfo(cwd) {
  const info = { branch: '', commit: '', short: '', remoteUrl: '', ahead: null, behind: null, clean: true, ok: false, error: '' };
  try {
    const branch = await run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    info.branch = branch.stdout.trim();
    const commit = await run(cwd, ['rev-parse', 'HEAD']);
    info.commit = commit.stdout.trim();
    info.short = info.commit.slice(0, 8);
    const remote = await run(cwd, ['remote', 'get-url', 'origin']);
    info.remoteUrl = remote.stdout.trim();

    const counts = await run(cwd, ['rev-list', '--left-right', '--count', `origin/${info.branch}...HEAD`]);
    const m = counts.stdout.trim().split(/\s+/).map(Number);
    if (m.length === 2 && !Number.isNaN(m[0]) && !Number.isNaN(m[1])) {
      info.behind = m[0];
      info.ahead = m[1];
    }
    const status = await run(cwd, ['status', '--porcelain']);
    info.clean = status.stdout.trim() === '';
    info.ok = true;
  } catch (err) {
    info.error = err.message || String(err);
  }
  return info;
}

async function fetch(cwd) {
  return run(cwd, ['fetch', 'origin']);
}

// Fast-forward-only pull of the current branch. Returns { code, stdout, stderr }.
async function pull(cwd) {
  const info = await getInfo(cwd);
  const branch = info.branch || 'master';
  return run(cwd, ['pull', '--ff-only', 'origin', branch]);
}

async function resetHard(cwd) {
  const info = await getInfo(cwd);
  const branch = info.branch || 'master';
  return run(cwd, ['reset', '--hard', `origin/${branch}`]);
}

async function clone(remoteUrl, dest) {
  return execFilePromise('git', ['clone', '--depth', '1', remoteUrl, dest], {});
}

module.exports = { getInfo, fetch, pull, resetHard, clone, run };
