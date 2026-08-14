import { spawn } from 'node:child_process';

// Spawn a Node-compatible runtime. Uses the current executable so dsh-agent
// works identically under plain `node` and under Electron-as-node
// (ELECTRON_RUN_AS_NODE=1 makes an Electron binary behave as `node`, and a real
// node binary simply ignores it).
export function spawnNode(args, opts = {}) {
  const env = { ...(opts.env ?? process.env), ELECTRON_RUN_AS_NODE: '1' };
  return spawn(process.execPath, args, { ...opts, env });
}
