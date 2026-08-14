import { randomUUID } from 'node:crypto';
import { AgentRuntime } from './runtime.mjs';
import { loadCredentials } from './credentials.mjs';

// Manages a fleet of local DeepSeek Harness agent runtimes.
export class Controller {
  constructor(opts) {
    this.paths = opts.paths;
    this.credentials = opts.credentials;
    this.defaults = {
      model: opts.model ?? 'deepseek-v4-flash',
      provider: opts.provider ?? 'deepseek-official',
      maxTokens: opts.maxTokens,
      workspace: opts.workspace ?? process.cwd(),
    };
    this.agents = new Map(); // id -> AgentRuntime
  }

  async spawn({ name, workspace, persona, model } = {}) {
    const id = randomUUID().slice(0, 8);
    const runtime = new AgentRuntime({
      bin: this.paths.bin,
      cordis: this.paths.cordis,
      harnessRoot: this.paths.harness,
      workspace: workspace ?? this.defaults.workspace,
      persona: persona ?? 'You are a coding agent.',
      model: model ?? this.defaults.model,
      provider: this.defaults.provider,
      maxTokens: this.defaults.maxTokens,
      // Re-read credentials on every spawn so newly saved API keys apply
      // without restarting the daemon.
      credentials: loadCredentials(),
      id,
      name: name ?? `agent-${id}`,
    });
    await runtime.start();
    this.agents.set(id, runtime);
    return this.describe(id);
  }

  describe(id) {
    const a = this.agents.get(id);
    if (!a) return null;
    return {
      id,
      name: a.name,
      pid: a.pid,
      model: a.model,
      workspace: a.workspace,
      sessionRoot: a.sessionRoot,
      state: a.state,
    };
  }

  list() {
    return [...this.agents.keys()].map((id) => this.describe(id)).filter(Boolean);
  }

  async ask(id, prompt, opts = {}) {
    const a = this.agents.get(id);
    if (!a) throw new Error(`unknown agent id: ${id}`);
    return a.run(prompt, opts);
  }

  async stop(id) {
    const a = this.agents.get(id);
    if (!a) return false;
    await a.close();
    this.agents.delete(id);
    return true;
  }

  async stopAll() {
    await Promise.all([...this.agents.values()].map((a) => a.close()));
    this.agents.clear();
  }
}
