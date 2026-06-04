#!/usr/bin/env node
/**
 * Apaga todas as contas e presença online do Insocialidade (n8n workflow static data).
 *
 * Requer .env com N8N_API_KEY.
 *
 * Uso: node scripts/reset-all-users.js
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
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

loadEnvFile();

const N8N_BASE = process.env.N8N_BASE_URL || 'https://n8n.timgo.uk';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_NAME = 'Insocialidade Auth';

if (!N8N_API_KEY) {
  console.error('Defina N8N_API_KEY no .env.');
  process.exit(1);
}

async function api(method, apiPath, body) {
  const res = await fetch(`${N8N_BASE}/api/v1${apiPath}`, {
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
  const list = await api('GET', '/workflows?limit=100');
  const found = list.data?.find((w) => w.name === WORKFLOW_NAME);
  if (!found) {
    throw new Error(`Workflow "${WORKFLOW_NAME}" não encontrado.`);
  }

  const full = await api('GET', `/workflows/${found.id}`);
  const users = full.staticData?.global?.users || {};
  const count = Object.keys(users).length;

  if (count === 0) {
    console.log('Nenhuma conta para apagar.');
    return;
  }

  await api('PUT', `/workflows/${found.id}`, {
    name: full.name,
    nodes: full.nodes,
    connections: full.connections,
    settings: full.settings,
    staticData: { global: { users: {}, presence: {} } },
  });

  console.log(`Apagadas ${count} conta(s): ${Object.keys(users).join(', ')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
