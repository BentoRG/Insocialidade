#!/usr/bin/env node
/**
 * Migra usuários do staticData do workflow n8n "Insocialidade Auth"
 * para server/data/users.json (auth-store).
 *
 * Uso: node scripts/migrate-users-from-n8n.js
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const N8N_API_BASE = process.env.N8N_API_URL || process.env.N8N_BASE_URL || 'https://n8n.timgo.uk';
const N8N_API_KEY = process.env.N8N_API_KEY;
const OLD_WORKFLOW_NAME = 'Insocialidade Auth';
const USERS_FILE = path.join(process.cwd(), 'server', 'data', 'users.json');

async function api(method, apiPath, body) {
  const res = await fetch(`${N8N_API_BASE}/api/v1${apiPath}`, {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${apiPath} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!N8N_API_KEY) {
    console.error('Defina N8N_API_KEY no .env.');
    process.exit(1);
  }

  const list = await api('GET', '/workflows?limit=100');
  const found = list.data?.find((w) => w.name === OLD_WORKFLOW_NAME);
  if (!found) {
    console.log(`Workflow "${OLD_WORKFLOW_NAME}" não encontrado — nada a migrar.`);
    return;
  }

  const full = await api('GET', `/workflows/${found.id}`);
  const users = full.staticData?.global?.users || {};
  const count = Object.keys(users).length;

  if (count === 0) {
    console.log('Nenhum usuário no n8n para migrar.');
    return;
  }

  if (fs.existsSync(USERS_FILE)) {
    const existing = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    if (Object.keys(existing).length > 0) {
      console.error(
        `${USERS_FILE} já contém ${Object.keys(existing).length} usuário(s). Apague ou faça backup antes de migrar.`
      );
      process.exit(1);
    }
  }

  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  console.log(`Migrados ${count} usuário(s) para ${USERS_FILE}:`);
  console.log(Object.keys(users).join(', '));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
