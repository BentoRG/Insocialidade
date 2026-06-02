#!/usr/bin/env node
/**
 * Cria e ativa o workflow "Insocialidade Auth" no n8n.
 * Uso: N8N_API_KEY=... node scripts/deploy-n8n-workflow.js
 */

const N8N_BASE = process.env.N8N_BASE_URL || 'https://n8n.timgo.uk';
const N8N_API_KEY = process.env.N8N_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '8670179404';
const SESSION_SECRET = process.env.SESSION_SECRET || 'insocialidade-session-v1';
const APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'insocialidade-approve-2026';
const WEBHOOK_URL = `${N8N_BASE}/webhook/insocialidade-auth`;

if (!N8N_API_KEY) {
  console.error('Defina N8N_API_KEY');
  process.exit(1);
}

const AUTH_CODE = `
const SESSION_SECRET = ${JSON.stringify(SESSION_SECRET)};
const APPROVAL_SECRET = ${JSON.stringify(APPROVAL_SECRET)};
const TELEGRAM_BOT_TOKEN = ${JSON.stringify(TELEGRAM_BOT_TOKEN)};
const TELEGRAM_CHAT_ID = ${JSON.stringify(TELEGRAM_CHAT_ID)};
const WEBHOOK_URL = ${JSON.stringify(WEBHOOK_URL)};

const staticData = $getWorkflowStaticData('global');
if (!staticData.users) staticData.users = {};

function simpleHash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

function randomId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function hashPassword(password, salt) {
  return simpleHash(salt + ':' + password + ':' + SESSION_SECRET);
}

function createToken(userId) {
  const iat = Date.now();
  const sig = simpleHash(SESSION_SECRET + userId + iat);
  return btoa(JSON.stringify({ sub: userId, iat, sig }));
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const data = JSON.parse(atob(token));
    if (!data?.sub || !data?.iat || !data?.sig) return null;
    if (Date.now() - data.iat > 7 * 24 * 60 * 60 * 1000) return null;
    if (simpleHash(SESSION_SECRET + data.sub + data.iat) !== data.sig) return null;
    return data.sub;
  } catch {
    return null;
  }
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await this.helpers.httpRequest({
      method: 'POST',
      url: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage',
      body: { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown', disable_web_page_preview: true },
      json: true,
    });
  } catch (err) {
    // Cadastro continua mesmo se o Telegram falhar (ex.: chat ID inválido ou bot não iniciado)
  }
}

function publicProfile(user) {
  return { username: user.username, character_color: user.character_color, status: user.status };
}

const input = $input.first().json;
const query = input.query || {};
const body = input.body || {};
const action = body.action || query.action;

async function handleRegister() {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const characterColor = String(body.characterColor || '');

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return [{ json: { ok: false, error: 'Usuário inválido.', httpStatus: 400 } }];
  }
  if (password.length < 6) {
    return [{ json: { ok: false, error: 'Senha muito curta.', httpStatus: 400 } }];
  }
  if (staticData.users[username]) {
    return [{ json: { ok: false, error: 'Este usuário já está em uso.', httpStatus: 409 } }];
  }

  const salt = randomId('s_');
  const userId = randomId('u_');
  staticData.users[username] = {
    id: userId,
    username,
    character_color: characterColor,
    status: 'pending',
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };

  const approveUrl = WEBHOOK_URL + '?action=approve&secret=' + encodeURIComponent(APPROVAL_SECRET) + '&username=' + encodeURIComponent(username);
  const rejectUrl = WEBHOOK_URL + '?action=reject&secret=' + encodeURIComponent(APPROVAL_SECRET) + '&username=' + encodeURIComponent(username);

  await sendTelegram.call(this,
    '🎮 *Novo cadastro — Insocialidade*\\n\\n' +
    '👤 Usuário: \`' + username + '\`\\n' +
    '🎨 Cor: \`' + characterColor + '\`\\n\\n' +
    '[✅ Aprovar](' + approveUrl + ')\\n' +
    '[❌ Rejeitar](' + rejectUrl + ')'
  );

  return [{ json: { ok: true, message: 'Cadastro pendente de aprovação.' } }];
}

async function handleLogin() {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = staticData.users[username];

  if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
    return [{ json: { ok: false, error: 'Usuário ou senha incorretos.', httpStatus: 401 } }];
  }
  if (user.status === 'pending') {
    return [{ json: { ok: false, error: 'Sua conta ainda aguarda aprovação do administrador.', httpStatus: 403 } }];
  }
  if (user.status === 'rejected') {
    return [{ json: { ok: false, error: 'Seu cadastro foi rejeitado.', httpStatus: 403 } }];
  }
  if (user.status !== 'active') {
    return [{ json: { ok: false, error: 'Conta inativa.', httpStatus: 403 } }];
  }

  return [{ json: { ok: true, token: createToken(user.id), profile: publicProfile(user) } }];
}

function handleSession() {
  const userId = verifyToken(body.token);
  if (!userId) {
    return [{ json: { ok: false, error: 'Sessão inválida.', httpStatus: 401 } }];
  }
  const user = Object.values(staticData.users).find((u) => u.id === userId);
  if (!user || user.status !== 'active') {
    return [{ json: { ok: false, error: 'Sessão inválida.', httpStatus: 401 } }];
  }
  return [{ json: { ok: true, profile: publicProfile(user) } }];
}

async function handleModeration() {
  const secret = query.secret || body.secret;
  const username = String(query.username || body.username || '').trim().toLowerCase();
  const modAction = action;

  if (secret !== APPROVAL_SECRET) {
    return [{ json: { ok: false, error: 'Acesso negado.', httpStatus: 403 } }];
  }
  const user = staticData.users[username];
  if (!user) {
    return [{ json: { ok: false, error: 'Usuário não encontrado.', httpStatus: 404 } }];
  }

  user.status = modAction === 'approve' ? 'active' : 'rejected';
  await sendTelegram.call(this,
    (modAction === 'approve' ? '✅' : '❌') + ' Usuário \`' + username + '\` foi ' +
    (modAction === 'approve' ? 'aprovado' : 'rejeitado') + '.'
  );

  return [{
    json: {
      ok: true,
      html: modAction === 'approve'
        ? '<h2>Conta aprovada!</h2><p>O usuário <strong>' + username + '</strong> já pode entrar.</p>'
        : '<h2>Conta rejeitada</h2><p>O usuário <strong>' + username + '</strong> foi rejeitado.</p>',
    },
  }];
}

return (async () => {
  switch (action) {
    case 'register': return await handleRegister();
    case 'login': return await handleLogin();
    case 'session': return handleSession();
    case 'approve':
    case 'reject': return await handleModeration();
    default:
      return [{ json: { ok: false, error: 'Ação inválida.', httpStatus: 400 } }];
  }
})();
`.trim();

const workflow = {
  name: 'Insocialidade Auth',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'insocialidade-auth',
        responseMode: 'responseNode',
        options: {
          allowedOrigins: '*',
        },
      },
      id: 'webhook-post',
      name: 'Webhook POST',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'insocialidade-auth-post',
    },
    {
      parameters: {
        httpMethod: 'GET',
        path: 'insocialidade-auth',
        responseMode: 'responseNode',
        options: {
          allowedOrigins: '*',
        },
      },
      id: 'webhook-get',
      name: 'Webhook GET',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 200],
      webhookId: 'insocialidade-auth-get',
    },
    {
      parameters: { jsCode: AUTH_CODE, mode: 'runOnceForAllItems' },
      id: 'auth-code-post',
      name: 'Auth Handler POST',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [260, 0],
    },
    {
      parameters: { jsCode: AUTH_CODE, mode: 'runOnceForAllItems' },
      id: 'auth-code-get',
      name: 'Auth Handler GET',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [260, 200],
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json }}',
        options: {
          responseCode: '={{ $json.httpStatus || 200 }}',
        },
      },
      id: 'respond-post',
      name: 'Respond POST',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [520, 0],
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: '=<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Insocialidade</title><style>body{font-family:sans-serif;background:#222233;color:#f8f3e6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#2a2a3d;padding:2rem;border-radius:12px;border:1px solid #474b6b;max-width:420px;text-align:center}a{color:#b89b6d}</style></head><body><div class="card">{{ $json.html }}<p><a href="index.html">Voltar ao login</a></p></div></body></html>',
        options: { responseCode: 200 },
      },
      id: 'respond-get',
      name: 'Respond GET',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [520, 200],
    },
  ],
  connections: {
    'Webhook POST': { main: [[{ node: 'Auth Handler POST', type: 'main', index: 0 }]] },
    'Webhook GET': { main: [[{ node: 'Auth Handler GET', type: 'main', index: 0 }]] },
    'Auth Handler POST': { main: [[{ node: 'Respond POST', type: 'main', index: 0 }]] },
    'Auth Handler GET': { main: [[{ node: 'Respond GET', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};

async function api(method, path, body) {
  const res = await fetch(`${N8N_BASE}/api/v1${path}`, {
    method,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const existing = await api('GET', '/workflows?limit=100');
  const found = existing.data?.find((w) => w.name === 'Insocialidade Auth');

  let workflowId;
  if (found) {
    console.log('Atualizando workflow existente:', found.id);
    const updated = await api('PUT', `/workflows/${found.id}`, {
      ...workflow,
      name: 'Insocialidade Auth',
    });
    workflowId = updated.id;
  } else {
    console.log('Criando workflow...');
    const created = await api('POST', '/workflows', workflow);
    workflowId = created.id;
  }

  await api('POST', `/workflows/${workflowId}/activate`);
  console.log('Workflow ativo:', workflowId);
  console.log('Webhook:', `${N8N_BASE}/webhook/insocialidade-auth`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
