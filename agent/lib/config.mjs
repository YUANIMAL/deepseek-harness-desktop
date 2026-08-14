import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  () => process.env.DSH_HARNESS || '',
  () => path.join(os.homedir(), 'deepseek-harness'),
  () => '/Users/yuanzhanghao/deepseek-harness',
];

export function detectHarness() {
  for (const c of CANDIDATES) {
    const p = c();
    if (p && existsSync(path.join(p, 'package.json')) && existsSync(path.join(p, 'apps', 'cli'))) {
      return path.resolve(p);
    }
  }
  return null;
}

export function resolvePaths() {
  const harness = detectHarness();
  if (!harness) {
    throw new Error('No DeepSeek Harness checkout found. Set DSH_HARNESS to the repo path.');
  }
  const bin = path.join(harness, 'packages', 'examples', 'jsonrpc-demo', 'lib', 'bin.js');
  const cordis = path.join(harness, 'examples', 'jsonrpc-agent', 'cordis.yml');
  if (!existsSync(bin) || !existsSync(cordis)) {
    throw new Error(`Harness SDK runtime not built (missing ${bin} or ${cordis}). Run \`pnpm run build\` in the harness checkout.`);
  }
  return { harness, bin, cordis };
}
