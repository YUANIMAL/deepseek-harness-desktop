'use strict';

// Child-process helpers shared by git / backend / plugin managers.

const { spawn, execFile } = require('child_process');

// Run to completion, capturing stdout/stderr. Resolves { code, stdout, stderr }.
function execFilePromise(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      maxBuffer: opts.maxBuffer || 64 * 1024 * 1024,
      timeout: opts.timeout || 0,
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code == null ? 1 : (error.killed ? 124 : 1)) : 0,
        signal: error && error.signal ? error.signal : null,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

// Spawn and stream stdout/stderr line-by-line through onLine. Resolves { code }.
function spawnStreaming(file, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      shell: opts.shell || false,
    });
    const emit = (chunk) => {
      const text = String(chunk || '');
      for (const line of text.split(/\r?\n/)) {
        if (line !== '' && opts.onLine) opts.onLine(line);
      }
    };
    child.stdout.on('data', emit);
    child.stderr.on('data', emit);
    child.on('error', (err) => {
      if (opts.onLine) opts.onLine(`spawn error: ${err.message}`);
      resolve({ code: 1 });
    });
    child.on('close', (code) => resolve({ code: code == null ? 1 : code }));
  });
}

module.exports = { execFilePromise, spawnStreaming };
