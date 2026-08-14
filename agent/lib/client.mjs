import net from 'node:net';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { socketPath, homeDir } from './daemon.mjs';
import { spawnNode } from './spawn-node.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function request(sock, payload, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(sock);
    let buf = '';
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error('daemon request timeout'));
    }, timeoutMs);
    conn.on('connect', () => conn.write(`${JSON.stringify(payload)}\n`));
    conn.on('data', (d) => {
      buf += d.toString();
      const idx = buf.indexOf('\n');
      if (idx >= 0) {
        clearTimeout(timer);
        const line = buf.slice(0, idx).trim();
        conn.end();
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error('bad daemon response'));
        }
      }
    });
    conn.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// Return the daemon socket path, auto-starting the daemon (detached) if needed.
export async function ensureDaemon() {
  const home = homeDir();
  const sock = socketPath(home);
  if (fs.existsSync(sock)) {
    try {
      const r = await request(sock, { cmd: 'ping' }, 2000);
      if (r.ok) return sock;
    } catch { /* stale socket */ }
  }
  const bin = fileURLToPath(new URL('../bin/dsh-agent.mjs', import.meta.url));
  spawnNode([bin, 'daemon'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DSH_AGENT_HOME: home },
  }).unref();

  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if (fs.existsSync(sock)) {
      try {
        const r = await request(sock, { cmd: 'ping' }, 2000);
        if (r.ok) return sock;
      } catch { /* not ready yet */ }
    }
  }
  throw new Error(`could not start daemon; see ${home}/daemon.log`);
}
