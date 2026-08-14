import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function homeDir() {
  return process.env.DSH_AGENT_HOME || path.join(os.homedir(), '.dsh-agent');
}

export function socketPath(home = homeDir()) {
  return path.join(home, 'dsh-agent.sock');
}

// Long-running controller daemon: holds the agent fleet and serves one
// newline-delimited JSON request/response per connection over a Unix socket.
export async function startDaemon({ controller, home = homeDir(), logFile }) {
  fs.mkdirSync(home, { recursive: true });
  const sock = socketPath(home);
  try { fs.unlinkSync(sock); } catch { /* stale socket */ }
  const log = fs.createWriteStream(logFile ?? path.join(home, 'daemon.log'), { flags: 'a' });

  const handle = async (req) => {
    const { cmd } = req;
    try {
      if (cmd === 'ping') return { ok: true, result: { pid: process.pid } };
      if (cmd === 'list') return { ok: true, result: controller.list() };
      if (cmd === 'spawn') {
        return { ok: true, result: await controller.spawn({ name: req.name, workspace: req.workspace, persona: req.persona, model: req.model }) };
      }
      if (cmd === 'ask') {
        const a = controller.agents.get(req.id);
        if (!a) return { ok: false, error: `unknown agent id: ${req.id}` };
        const answer = await a.run(req.prompt, { timeoutMs: req.timeoutMs });
        return { ok: true, result: answer };
      }
      if (cmd === 'stop') return { ok: true, result: await controller.stop(req.id) };
      if (cmd === 'stopAll') {
        await controller.stopAll();
        return { ok: true, result: true };
      }
      return { ok: false, error: `unknown command: ${cmd}` };
    } catch (e) {
      return { ok: false, error: e.message ?? String(e) };
    }
  };

  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let req;
        try {
          req = JSON.parse(line);
        } catch {
          continue;
        }
        handle(req)
          .then((res) => conn.write(`${JSON.stringify(res)}\n`))
          .catch((e) => conn.write(`${JSON.stringify({ ok: false, error: e.message })}\n`));
      }
    });
    conn.on('error', () => {});
  });
  server.on('error', (e) => log.write(`[daemon] error: ${e.message}\n`));

  await new Promise((resolve) => server.listen(sock, resolve));
  log.write(`[daemon] listening on ${sock} (pid ${process.pid})\n`);

  const shutdown = async () => {
    log.write('[daemon] shutting down\n');
    await controller.stopAll().catch(() => {});
    server.close();
    try { fs.unlinkSync(sock); } catch { /* already gone */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, sock };
}
