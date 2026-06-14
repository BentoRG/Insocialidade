#!/usr/bin/env node
/**
 * Deploy do workflow "Insocialidade Approval" no n8n.
 * Só dispara quando alguém tenta criar conta nova (envia Telegram).
 *
 * Aprovar/rejeitar no Telegram é tratado pelo servidor Node (/auth/telegram).
 *
 * Requer .env com N8N_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID
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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '8670179404';
const TELEGRAM_BOT_ID = process.env.TELEGRAM_BOT_ID || '8773138632';
const OLD_WORKFLOW_NAME = 'Insocialidade Auth';
const WORKFLOW_NAME = 'Insocialidade Approval';

if (!N8N_API_KEY) {
  console.error('Defina N8N_API_KEY no .env ou no ambiente.');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Defina TELEGRAM_BOT_TOKEN no .env (token do @InsocialidadeBot via @BotFather).');
  process.exit(1);
}

const COLOR_LABELS = {
  '#27609e': 'Azul oceano',
  '#4a4a4a': 'Cinza',
  '#4ea6ec': 'Azul céu',
  '#ffffff': 'Branco',
  '#c2a278': 'Areia',
  '#90c25e': 'Verde',
  '#4b6629': 'Musgo',
};

const NOTIFY_CODE = `
const TELEGRAM_BOT_TOKEN = ${JSON.stringify(TELEGRAM_BOT_TOKEN)};
const TELEGRAM_CHAT_ID = ${JSON.stringify(TELEGRAM_CHAT_ID)};

const COLOR_LABELS = ${JSON.stringify(COLOR_LABELS)};

function normalizeCharacterColor(hex) {
  const value = String(hex || '').trim().toLowerCase();
  return value.startsWith('#') ? value : '#' + value;
}

function colorLabel(hex) {
  return COLOR_LABELS[normalizeCharacterColor(hex)] || hex;
}

async function telegramApi(method, body) {
  return this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/' + method,
    body,
    json: true,
  });
}

const input = $input.first().json;
const body = input.body || input;

const userId = String(body.userId || '').trim();
const username = String(body.username || '').trim();
const characterColor = normalizeCharacterColor(body.characterColor);

if (!userId || !username) {
  return [{ json: { ok: false, error: 'Dados incompletos.' } }];
}

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  return [{ json: { ok: false, error: 'Telegram não configurado.' } }];
}

await telegramApi.call(this, 'sendMessage', {
  chat_id: TELEGRAM_CHAT_ID,
  text:
    '🎮 Novo cadastro — Insocialidade\\n\\n' +
    '👤 Usuário: ' + username + '\\n' +
    '🎨 Cor: ' + colorLabel(characterColor) + '\\n\\n' +
    'Aprove ou rejeite:',
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Aprovar', callback_data: 'approve:' + userId },
      { text: '❌ Não aprovar', callback_data: 'reject:' + userId },
    ]],
  },
});

return [{ json: { ok: true } }];
`.trim();

const workflow = {
  name: WORKFLOW_NAME,
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'insocialidade-approval-notify',
        responseMode: 'onReceived',
        options: { allowedOrigins: '*' },
      },
      id: 'webhook-notify',
      name: 'Webhook Notify',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'insocialidade-approval-notify',
    },
    {
      parameters: { jsCode: NOTIFY_CODE, mode: 'runOnceForAllItems' },
      id: 'notify-code',
      name: 'Notify Handler',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 0],
    },
  ],
  connections: {
    'Webhook Notify': { main: [[{ node: 'Notify Handler', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

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

async function verifyTelegramBot() {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Token Telegram inválido: ${data.description}`);
  }

  const bot = data.result;
  console.log(`Bot: @${bot.username} (id ${bot.id})`);

  if (String(bot.id) !== String(TELEGRAM_BOT_ID)) {
    console.warn(
      `Aviso: TELEGRAM_BOT_ID esperado ${TELEGRAM_BOT_ID}, bot retornou ${bot.id}. Continuando mesmo assim.`
    );
  }

  return bot;
}

async function deactivateOldWorkflow() {
  const existing = await api('GET', '/workflows?limit=100');
  const old = existing.data?.find((w) => w.name === OLD_WORKFLOW_NAME);
  if (!old?.active) return;
  await api('POST', `/workflows/${old.id}/deactivate`);
  console.log('Workflow antigo desativado:', old.id);
}

async function main() {
  await verifyTelegramBot();

  const existing = await api('GET', '/workflows?limit=100');
  const found = existing.data?.find((w) => w.name === WORKFLOW_NAME);

  let workflowId;
  if (found) {
    console.log('Atualizando workflow existente:', found.id);
    const updated = await api('PUT', `/workflows/${found.id}`, {
      ...workflow,
      name: WORKFLOW_NAME,
    });
    workflowId = updated.id;
  } else {
    console.log('Criando workflow...');
    const created = await api('POST', '/workflows', workflow);
    workflowId = created.id;
  }

  await api('POST', `/workflows/${workflowId}/activate`);
  console.log('Workflow ativo:', workflowId);

  await deactivateOldWorkflow();

  console.log('');
  console.log('n8n roda SOMENTE em novo cadastro:');
  console.log('  POST http://127.0.0.1:5678/webhook/insocialidade-approval-notify');
  console.log('');
  console.log('Telegram (aprovar/rejeitar) → servidor Node /auth/telegram');
  console.log('  Rode: node scripts/configure-telegram-webhook.js');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
