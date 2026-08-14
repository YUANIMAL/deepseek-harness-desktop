'use strict';

// Read/write the app-managed agent credentials file (~/.dsh-agent/credentials.yaml)
// and surface a masked view for the Settings tab. Matches dsh-agent's
// credentials.mjs precedence: env → ~/.dsh-agent/credentials.yaml → ~/.dsh/.credentials.yaml.

const fs = require('fs');
const os = require('os');
const path = require('path');

function agentHome() {
  return process.env.DSH_AGENT_HOME || path.join(os.homedir(), '.dsh-agent');
}

function credentialsFile() {
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
    // missing file
  }
  return out;
}

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

// Merged credentials (raw). Do not send this over IPC.
function readAll() {
  return {
    ...readYamlFile(path.join(os.homedir(), '.dsh', '.credentials.yaml')),
    ...readYamlFile(credentialsFile()),
    ...envCredentials(),
  };
}

// Only the app-managed file's entries (used to merge on save).
function readFileEntries() {
  return readYamlFile(credentialsFile());
}

function mask(value) {
  if (!value) return '';
  if (value.length <= 4) return '\u2022\u2022\u2022\u2022';
  return `\u2022\u2022\u2022\u2022\u2022\u2022${value.slice(-4)}`;
}

// Masked view (safe for IPC): secrets are masked, base URLs shown in full.
function readMasked() {
  const all = readAll();
  const masked = {};
  for (const [k, v] of Object.entries(all)) {
    masked[k] = /_(BASE_URL|API_BASE)$/.test(k) ? v : mask(v);
  }
  return masked;
}

function write(entries) {
  const lines = Object.entries(entries)
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => `${k}: ${v.trim()}`);
  fs.mkdirSync(agentHome(), { recursive: true });
  const file = credentialsFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

module.exports = { agentHome, credentialsFile, readAll, readFileEntries, readMasked, write };
