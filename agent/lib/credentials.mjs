import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function agentHome() {
  return process.env.DSH_AGENT_HOME || path.join(os.homedir(), '.dsh-agent');
}

// The app-managed credentials file (written by the desktop app's Settings tab
// or by `saveCredentials`).
export function credentialsFilePath() {
  return path.join(agentHome(), 'credentials.yaml');
}

function readYamlFile(file) {
  const out = {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    // missing file — empty
  }
  return out;
}

// Merge credential-like env vars (standard API-key / base-URL naming).
function envCredentials() {
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    if (/^(DEEPSEEK|OPENAI|ANTHROPIC|AZURE|GEMINI|GROQ|MISTRAL|XAI)_/.test(k) || /_(API_KEY|BASE_URL|API_BASE)$/.test(k)) {
      out[k] = v;
    }
  }
  return out;
}

// Precedence: env → ~/.dsh-agent/credentials.yaml (app-managed) → ~/.dsh/.credentials.yaml.
export function loadCredentials() {
  return {
    ...readYamlFile(path.join(os.homedir(), '.dsh', '.credentials.yaml')),
    ...readYamlFile(credentialsFilePath()),
    ...envCredentials(),
  };
}

// Persist the app-managed credentials file (flat `KEY: value` YAML).
export function saveCredentials(entries) {
  const lines = Object.entries(entries)
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => `${k}: ${v.trim()}`);
  fs.mkdirSync(agentHome(), { recursive: true });
  const file = credentialsFilePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
  fs.renameSync(tmp, file);
  return file;
}
