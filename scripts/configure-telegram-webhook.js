#!/usr/bin/env node
/**
 * Aponta o webhook do @InsocialidadeBot para o servidor Node (/auth/telegram).
 * Não usa n8n — só o cadastro novo passa pelo n8n.
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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBHOOK_URL =
  process.env.TELEGRAM_WEBHOOK_URL ||
  'https://api-insocialidade.timgo.uk/auth/telegram';

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Defina TELEGRAM_BOT_TOKEN no .env');
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      allowed_updates: ['callback_query'],
      drop_pending_updates: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || 'setWebhook falhou');
  }
  console.log('Telegram webhook:', WEBHOOK_URL);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
