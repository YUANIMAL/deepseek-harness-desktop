'use strict';

// DeepSeek Harness web backend lifecycle: health check, spawn/stop the
// `dsh web` server, and wait until the port answers.

const http = require('http');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';

// Any HTTP response means a server is listening (a 404 still counts as "up").
function healthCheck(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port, path: '/', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, timeoutMs = 30000, onTick) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthCheck(port, 1200)) return true;
    if (onTick) onTick();
    await new Promise((r) => setTimeout(r, 800));
  }
  return healthCheck(port, 1500);
}

// Spawn `node <cliBin> web`. Returns the child process.
function start({ cliBin, port, env, nodeBin }) {
  const child = spawn(nodeBin || 'node', [cliBin, 'web'], {
    cwd: process.cwd(),
    env: { ...process.env, ...(env || {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

function stop(child) {
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      child.once('close', () => resolve());
      child.kill('SIGTERM');
      // Fallback hard-kill if it ignores SIGTERM.
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        resolve();
      }, 3000);
    } catch {
      resolve();
    }
  });
}

module.exports = { HOST, healthCheck, waitForPort, start, stop };
