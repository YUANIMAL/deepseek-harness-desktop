# dsh-agent — local agent controller for DeepSeek Harness

Run and **operate multiple local DeepSeek Harness agents** from your terminal.
Each agent is a real `dsh-jsonrpc-agent` runtime subprocess driven over the DSH
SDK's stdio JSON-RPC protocol — no browser, no cloud, no dependencies.

> You are already talking to one: DeepSeek Harness is the harness running this
> very agent. `dsh-agent` exposes that same capability as a local CLI you can
> script and parallelize.

## What it can do

| Command | What it does |
| --- | --- |
| `dsh-agent run "<task>"` | one task on a fresh local agent (one-shot) |
| `dsh-agent team "<goal>" --n <k>` | `k` agents on one goal **in parallel** |
| `dsh-agent spawn [name]` | start a long-lived local agent |
| `dsh-agent list` | list running agents |
| `dsh-agent ask <id> "<prompt>"` | send a prompt to a running agent |
| `dsh-agent stop <id>` / `stop --all` | stop agents |
| `dsh-agent daemon` | run the controller daemon in the foreground |

One-shot `run`/`team` run in-process; persistent `spawn`/`list`/`ask`/`stop` go
through a background daemon that is **auto-started on first use**.

## Requirements

- A DeepSeek Harness **source checkout** (built): the agent runtime is
  `packages/examples/jsonrpc-demo/lib/bin.js` + `examples/jsonrpc-agent/cordis.yml`.
  Auto-detected at `~/deepseek-harness` / `DSH_HARNESS`.
- `DEEPSEEK_API_KEY` (or `~/.dsh/.credentials.yaml`). Default model
  `deepseek-v4-flash`; pass `--model deepseek-v4-pro` to override.

## Run

```sh
cd dsh-agent
node bin/dsh-agent.mjs --help          # or:
npm link                               # then use `dsh-agent` directly
```

Examples:

```sh
dsh-agent run "list the files in this directory and summarize them"
dsh-agent run "write a fibonacci function in python and test it" --workspace ~/myproject
dsh-agent team "research 3 ways to do X and pick the best" --n 3

dsh-agent spawn builder --workspace ~/myproject
dsh-agent ask <id> "add a .gitignore"
dsh-agent stop <id>
```

## How it works

```
dsh-agent CLI ──spawn──▶ node <harness>/packages/examples/jsonrpc-demo/lib/bin.js <cordis.yml>
                            ▲   runtime = full harness (bash / fs / subagent / todo tools)
                            │   serves newline-delimited JSON-RPC over stdio
                            ▼
                        controller sends initialize → session/prompt → collects
                        session.event / session.status → final assistant text
```

- `lib/runtime.mjs` — one agent runtime (spawn + hand-rolled JSON-RPC client +
  notification buffering, matching the SDK's inbox-receipt → idle semantics).
- `lib/controller.mjs` — fleet management (spawn/list/ask/stop).
- `lib/daemon.mjs` / `lib/client.mjs` — Unix-socket daemon so persistent agents
  survive across CLI invocations.
- Each agent has its own workspace (`--workspace`, default cwd) and session dir
  (`~/.dsh-agent/sessions/<id>`, or `DSH_AGENT_HOME`).

## Environment

| Variable | Purpose |
| --- | --- |
| `DSH_HARNESS` | harness checkout path (auto-detected) |
| `DSH_AGENT_HOME` | daemon + session state dir (default `~/.dsh-agent`) |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | model credential (falls back to `~/.dsh/.credentials.yaml`) |

## Notes

- Every agent is a full DSH agent: it can itself spawn **in-process subagents**
  (the `subagent` tool) to divide work — watch for `· agent-X: spawned subagent`
  in the progress stream.
- `--model` defaults to `deepseek-v4-flash` (fast/cheap); use
  `deepseek-v4-pro` for harder tasks.
