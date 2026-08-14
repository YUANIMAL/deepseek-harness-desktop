#!/usr/bin/env node
// dsh-agent — local agent controller for DeepSeek Harness.
// Spawns and operates multiple local DSH agents (JSON-RPC runtime) from the CLI.
// One-shot `run`/`team` run in-process; persistent `spawn`/`list`/`ask`/`stop`
// go through a background daemon (auto-started on first use).

import { resolvePaths } from '../lib/config.mjs';
import { loadCredentials } from '../lib/credentials.mjs';
import { Controller } from '../lib/controller.mjs';
import { startDaemon, homeDir } from '../lib/daemon.mjs';
import { ensureDaemon, request } from '../lib/client.mjs';
import { decompose, synthesize } from '../lib/plan.mjs';

const HELP = `
dsh-agent — run & operate local DeepSeek Harness agents

One-shot (no daemon):
  dsh-agent run "<task>"                 run one task on a fresh local agent
  dsh-agent team "<goal>" --n <k>        auto-split into <k> subtasks, run in parallel,
                                       then merge results into one final answer
                                       (--broadcast: same goal to all; --raw: no merge)

Persistent (via a background daemon, auto-started):
  dsh-agent spawn [name]                 start an idle local agent, print its id
  dsh-agent list                         list running agents
  dsh-agent ask <id> "<prompt>"          send a prompt to a running agent
  dsh-agent stop <id>                    stop one agent
  dsh-agent stop --all                   stop every agent
  dsh-agent daemon                       run the daemon in the foreground

Options (run / spawn / team):
  --workspace <dir>   agent workspace (default: current directory)
  --model <m>         worker model: deepseek-v4-flash (default) | deepseek-v4-pro
  --coordinator-model <m>  planner model for team decomposition (default deepseek-v4-pro)
  --broadcast         team: send the same goal to all workers (no decomposition)
  --raw               team: skip the final synthesis, print raw worker results
  --persona <text>    override the agent system prompt
  --timeout <ms>      per-prompt timeout

Env:
  DSH_HARNESS         path to the deepseek-harness checkout (auto-detected)
  DSH_AGENT_HOME      daemon/session state dir (default ~/.dsh-agent)
  DEEPSEEK_API_KEY    credential (falls back to ~/.dsh/.credentials.yaml)
`;

function argParse(argv) {
  const opts = { cmd: argv[0], args: [], n: 1 };
  let i = 1;
  const next = (flag) => {
    if (i + 1 >= argv.length) throw new Error(`${flag} needs a value`);
    return argv[++i];
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace') opts.workspace = next(a);
    else if (a === '--model') opts.model = next(a);
    else if (a === '--persona') opts.persona = next(a);
    else if (a === '--timeout') opts.timeout = parseInt(next(a), 10);
    else if (a === '--n') opts.n = parseInt(next(a), 10);
    else if (a === '--coordinator-model') opts.coordinatorModel = next(a);
    else if (a === '--broadcast') opts.broadcast = true;
    else if (a === '--raw') opts.raw = true;
    else if (a === '--all') opts.all = true;
    else opts.args.push(a);
  }
  return opts;
}

function progress(label) {
  return (n) => {
    if (n.method === 'session.status') {
      console.error(`  · ${label}: ${n.params.status}`);
    } else if (n.method === 'subagent.started') {
      console.error(`  · ${label}: spawned subagent ${String(n.params.childSessionId).slice(0, 8)}`);
    }
  };
}

function requireKey(credentials) {
  if (!credentials.DEEPSEEK_API_KEY) {
    throw new Error('No DEEPSEEK_API_KEY found. Set it in the env or in ~/.dsh/.credentials.yaml.');
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log(HELP);
    process.exit(0);
  }
  const opts = argParse(argv);
  const cmd = opts.cmd;

  // --- daemon (foreground, long-lived) ---
  if (cmd === 'daemon') {
    const paths = resolvePaths();
    const credentials = loadCredentials();
    const ctrl = new Controller({ paths, credentials, model: opts.model });
    console.error(`dsh-agent daemon starting (home ${homeDir()})`);
    await startDaemon({ controller: ctrl });
    // keep alive; server holds the event loop
    setInterval(() => {}, 1 << 30);
    return;
  }

  // --- persistent commands via daemon ---
  if (['spawn', 'list', 'ask', 'stop'].includes(cmd)) {
    const sock = await ensureDaemon();
    if (cmd === 'spawn') {
      const r = await request(sock, { cmd: 'spawn', name: opts.args[0], workspace: opts.workspace ?? process.cwd(), persona: opts.persona, model: opts.model });
      if (!r.ok) throw new Error(r.error);
      console.log(JSON.stringify(r.result, null, 2));
    } else if (cmd === 'list') {
      const r = await request(sock, { cmd: 'list' });
      if (!r.ok) throw new Error(r.error);
      if (r.result.length === 0) console.log('no agents running');
      else for (const a of r.result) console.log(`${a.id}\t${a.name}\tpid=${a.pid}\t${a.model}\t${a.workspace}`);
    } else if (cmd === 'ask') {
      const id = opts.args[0];
      const prompt = opts.args.slice(1).join(' ');
      if (!id || !prompt) throw new Error('ask needs <id> and "<prompt>"');
      const r = await request(sock, { cmd: 'ask', id, prompt, timeoutMs: opts.timeout });
      if (!r.ok) throw new Error(r.error);
      console.log(r.result);
    } else if (cmd === 'stop') {
      if (opts.all) {
        const r = await request(sock, { cmd: 'stopAll' });
        if (!r.ok) throw new Error(r.error);
        console.log('stopped all agents');
      } else {
        const id = opts.args[0];
        if (!id) throw new Error('stop needs an id or --all');
        const r = await request(sock, { cmd: 'stop', id });
        if (!r.ok) throw new Error(r.error);
        console.log(r.result ? `stopped ${id}` : `no such agent: ${id}`);
      }
    }
    process.exit(0);
  }

  // --- one-shot commands (in-process) ---
  const paths = resolvePaths();
  const credentials = loadCredentials();
  const ctrl = new Controller({ paths, credentials, model: opts.model, workspace: opts.workspace });
  const shutdown = async () => { await ctrl.stopAll(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (cmd === 'run') {
    const task = opts.args.join(' ');
    if (!task) throw new Error('run needs a task');
    requireKey(credentials);
    console.error(`▸ spawning local agent (${opts.model ?? 'deepseek-v4-flash'}, workspace ${opts.workspace ?? process.cwd()})`);
    const a = await ctrl.spawn({ persona: opts.persona });
    console.error(`▸ agent ${a.name} (${a.id}) running…`);
    const answer = await ctrl.ask(a.id, task, { onNotification: progress(a.name), timeoutMs: opts.timeout });
    console.log(answer);
    await ctrl.stopAll();
    process.exit(0);
  }

  if (cmd === 'team') {
    const goal = opts.args.join(' ');
    if (!goal) throw new Error('team needs a goal');
    requireKey(credentials);
    const n = Math.max(1, opts.n);

    let tasks;
    if (opts.broadcast) {
      tasks = Array(n).fill(goal);
      console.error(`▸ team (broadcast): ${n} agents on the same goal → "${goal}"`);
    } else {
      console.error(`▸ team (decompose): planning ${n} subtasks with a coordinator…`);
      const plan = await decompose(ctrl, goal, n, { timeoutMs: opts.timeout, coordinatorModel: opts.coordinatorModel });
      if (!plan.tasks) {
        console.error('  ! coordinator returned no JSON array — falling back to broadcast.');
        tasks = Array(n).fill(goal);
      } else {
        tasks = plan.tasks;
        console.error(`  ✓ planned ${tasks.length} subtasks:`);
        tasks.forEach((t, i) => console.error(`    ${i + 1}. ${t}`));
      }
    }

    const workers = await Promise.all(
      tasks.map((_, i) => ctrl.spawn({
        name: `worker-${i + 1}`,
        persona: opts.persona ?? `You are worker ${i + 1} of ${tasks.length} working on a subtask. Work independently and report your result concisely.`,
      })),
    );
    const results = await Promise.allSettled(
      workers.map((w, i) => ctrl.ask(w.id, tasks[i], { onNotification: progress(w.name), timeoutMs: opts.timeout })),
    );

    // Merge successful worker results into one final answer (unless --raw).
    const fulfilled = [];
    results.forEach((r, i) => { if (r.status === 'fulfilled') fulfilled.push(r.value); });
    let synthesized = null;
    if (!opts.raw && fulfilled.length >= 2) {
      console.error('\u25b8 synthesizing final answer\u2026');
      try {
        synthesized = await synthesize(ctrl, goal, fulfilled, { timeoutMs: opts.timeout, coordinatorModel: opts.coordinatorModel });
      } catch (e) {
        console.error(`  ! synthesis failed (${e.message}) \u2014 showing raw results.`);
      }
    }

    if (synthesized) {
      console.log('\n=== final answer ===\n' + synthesized);
      console.log('\n--- worker results ---');
    } else {
      console.log('\n=== team results ===');
    }
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') console.log(`\n[${workers[i].name}] ${r.value}`);
      else console.log(`\n[${workers[i].name}] ERROR: ${r.reason?.message ?? r.reason}`);
    });
    await ctrl.stopAll();
    process.exit(0);
  }

  throw new Error(`unknown command: ${cmd}\n${HELP}`);
}

main().catch((err) => {
  console.error(`\n[dsh-agent] ${err.message}`);
  process.exit(1);
});
