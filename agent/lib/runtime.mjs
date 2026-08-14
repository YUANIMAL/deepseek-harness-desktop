import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnNode } from './spawn-node.mjs';

// One local DeepSeek Harness agent: a `dsh-jsonrpc-agent` runtime subprocess
// driven over newline-delimited JSON-RPC on stdio. Zero dependencies.

function finalResponse(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.type === 'assistant/message') {
      const content = e.data?.message?.content ?? [];
      return content.filter((b) => b?.type === 'text').map((b) => b.text).join('');
    }
  }
  return '';
}

export class AgentRuntime {
  constructor(opts) {
    this.bin = opts.bin;
    this.cordis = opts.cordis;
    this.harnessRoot = opts.harnessRoot;
    this.workspace = opts.workspace ?? process.cwd();
    this.sessionRoot = opts.sessionRoot ?? path.join(
      process.env.DSH_AGENT_HOME || path.join(os.homedir(), '.dsh-agent'),
      'sessions',
      randomUUID().slice(0, 8),
    );
    this.persona = opts.persona ?? 'You are a coding agent.';
    this.model = opts.model ?? 'deepseek-v4-flash';
    this.provider = opts.provider ?? 'deepseek-official';
    this.maxTokens = opts.maxTokens;
    this.credentials = opts.credentials ?? {};
    this.extraEnv = opts.env ?? {};
    this.id = opts.id ?? randomUUID().slice(0, 8);
    this.name = opts.name ?? `agent-${this.id}`;

    this.child = null;
    this.buf = '';
    this.pending = new Map();
    this.nextId = 1;
    this.listeners = new Set();
    this.serverInfo = null;
    this.state = 'new'; // new | starting | ready | closed
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  async start() {
    if (this.state === 'ready') return this.serverInfo;
    if (this.state === 'starting') return this.serverInfo;
    this.state = 'starting';

    fs.mkdirSync(this.sessionRoot, { recursive: true });
    // Pass every configured credential (DeepSeek + others) into the runtime env.
    const credEnv = {};
    for (const [k, v] of Object.entries(this.credentials)) {
      if (typeof v === 'string' && v.trim() !== '') credEnv[k] = v;
    }
    const env = {
      ...process.env,
      ...credEnv,
      DSH_CWD: this.workspace,
      DSH_SESSION_ROOT: this.sessionRoot,
      DSH_SYSTEM_PROMPT: this.persona,
      ...this.extraEnv,
    };

    this.child = spawnNode([this.bin, this.cordis], {
      cwd: this.harnessRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.on('data', (d) => this._feed(d));
    this.child.stderr.on('data', (d) => this._stderr(d));
    this.child.on('exit', (code) => {
      this.state = 'closed';
      this._failAll(new Error(`runtime exited (code ${code})`));
    });

    const res = await this._request('initialize', {
      cwd: this.workspace,
      provider: this.provider,
      model: this.model,
      ...(this.maxTokens ? { maxTokens: this.maxTokens } : {}),
    });
    this.serverInfo = res?.serverInfo ?? null;
    this.state = 'ready';
    return this.serverInfo;
  }

  _feed(data) {
    this.buf += data.toString();
    let idx;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // non-JSON stdout — ignore (protocol purity is deployment-enforced)
      }
      if (obj.id !== undefined && obj.method === undefined) {
        const p = this.pending.get(obj.id);
        if (p) {
          this.pending.delete(obj.id);
          if (obj.result !== undefined && p.onResult) p.onResult(obj.result);
          if (obj.error) p.reject(new Error(obj.error.message ?? JSON.stringify(obj.error)));
          else p.resolve(obj.result);
        }
      } else if (obj.method !== undefined) {
        for (const l of [...this.listeners]) {
          try {
            l({ method: obj.method, params: obj.params ?? {} });
          } catch {
            /* listener errors are isolated */
          }
        }
      }
    }
  }

  _stderr(data) {
    process.stderr.write(`[${this.name}] ${data}`);
  }

  _request(method, params, onResult) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onResult });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  _on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Run one prompt on a (named or fresh) session, settling when the whole agent
  // goes idle after the enqueued turn. Returns the final assistant text.
  //
  // The runtime emits the inbox receipt BEFORE the `session/prompt` response, so
  // notifications are buffered from subscribe time and replayed against the
  // messageId once the response arrives (the same shape the SDK uses).
  async run(text, { sessionId, onNotification, timeoutMs } = {}) {
    await this.start();
    const sid = sessionId ?? `s-${randomUUID().slice(0, 8)}`;
    const effectiveTimeout = timeoutMs ?? 600000;

    const queue = [];
    const waiters = [];
    const unsub = this._on((n) => {
      if (waiters.length) waiters.shift()(n);
      else queue.push(n);
    });
    const next = () => new Promise((res) => {
      if (queue.length) res(queue.shift());
      else waiters.push(res);
    });

    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        unsub();
        fn(val);
      };
      timer = setTimeout(() => settle(reject, new Error(`timeout after ${effectiveTimeout}ms`)), effectiveTimeout);

      let messageId = null;
      let received = false;
      const events = [];

      (async () => {
        try {
          const resp = await this._request('session/prompt', {
            sessionId: sid,
            contentBlocks: [{ type: 'text', text }],
          });
          messageId = resp.messageId;
          while (true) {
            const n = await next();
            try {
              if (onNotification) onNotification(n);
            } catch {
              /* observer errors are isolated */
            }
            if (!received) {
              if (
                n.method === 'session.event' &&
                n.params.sessionId === sid &&
                n.params.event?.type === 'agent/inbox/spliced'
              ) {
                const inserted = n.params.event.data?.inserted ?? [];
                if (inserted.some((m) => m.id === messageId)) received = true;
              }
              continue;
            }
            if (n.method === 'session.event' && n.params.sessionId === sid) {
              events.push(n.params.event);
            }
            if (n.method === 'session.status' && n.params.sessionId === sid && n.params.status === 'idle') {
              settle(resolve, finalResponse(events));
              return;
            }
          }
        } catch (e) {
          settle(reject, e);
        }
      })();
    });
  }

  _failAll(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
    this.listeners.clear();
  }

  async close() {
    if (this.state === 'closed') return;
    if (this.child) {
      const child = this.child;
      this.child = null;
      try {
        await this._request('shutdown', {});
      } catch {
        /* runtime may already be gone */
      }
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* gone */ }
          resolve();
        }, 3000);
        child.once('exit', () => { clearTimeout(t); resolve(); });
        try { child.kill('SIGTERM'); } catch { resolve(); }
      });
    }
    this.state = 'closed';
  }
}

export { finalResponse };
