#!/usr/bin/env node
/**
 * Deploy do workflow "Insocialidade Auth" no n8n.
 *
 * Requer .env na raiz do projeto (não commitado) com:
 *   N8N_API_KEY=...
 *   TELEGRAM_BOT_TOKEN=8773138632:...   (@InsocialidadeBot via @BotFather)
 *   TELEGRAM_ADMIN_CHAT_ID=8670179404
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

const N8N_BASE = process.env.N8N_BASE_URL || 'https://n8n.timgo.uk';
const N8N_API_KEY = process.env.N8N_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '8670179404';
const TELEGRAM_BOT_ID = process.env.TELEGRAM_BOT_ID || '8773138632';
const SESSION_SECRET = process.env.SESSION_SECRET || 'insocialidade-session-v1';
const APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'insocialidade-approve-2026';
const TELEGRAM_WEBHOOK_URL = `${N8N_BASE}/webhook/insocialidade-telegram`;

if (!N8N_API_KEY) {
  console.error('Defina N8N_API_KEY no .env ou no ambiente.');
  process.exit(1);
}

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Defina TELEGRAM_BOT_TOKEN no .env (token do @InsocialidadeBot via @BotFather).');
  process.exit(1);
}

const SHARED_HEADER = `
const SESSION_SECRET = ${JSON.stringify(SESSION_SECRET)};
const TELEGRAM_BOT_TOKEN = ${JSON.stringify(TELEGRAM_BOT_TOKEN)};
const TELEGRAM_CHAT_ID = ${JSON.stringify(TELEGRAM_CHAT_ID)};

const staticData = $getWorkflowStaticData('global');
if (!staticData.users) staticData.users = {};
if (!staticData.presence) staticData.presence = {};
if (!staticData.localChats) staticData.localChats = {};

const PRESENCE_STALE_MS = 15000;
const LOCAL_CHAT_MAX_TEXT = 500;
const LOCAL_CHAT_ROOM_STALE_MS = 30 * 60 * 1000;
const LOCAL_CHAT_MAX_MESSAGES = 200;

function usernameKey(name) {
  return String(name || '').trim().toLocaleLowerCase('pt-BR');
}

function isValidUsername(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  return /^[\\p{L}0-9_]+$/u.test(trimmed);
}

async function telegramApi(method, body) {
  return this.helpers.httpRequest({
    method: 'POST',
    url: 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/' + method,
    body,
    json: true,
  });
}

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

function publicProfile(user) {
  const profile = {
    id: user.id,
    username: user.username,
    character_color: user.character_color,
    status: user.status,
  };
  if (Number.isFinite(user.last_x) && Number.isFinite(user.last_y)) {
    profile.saved_position = {
      x: user.last_x,
      y: user.last_y,
      facing: user.last_facing || 'down',
      map: user.last_map || '',
    };
  }
  return profile;
}

const VALID_CHARACTER_COLORS = new Set([
  '#27609e',
  '#4a4a4a',
  '#4ea6ec',
  '#ffffff',
  '#c2a278',
  '#90c25e',
  '#4b6629',
]);

const COLOR_LABELS = {
  '#27609e': 'Azul oceano',
  '#4a4a4a': 'Cinza',
  '#4ea6ec': 'Azul céu',
  '#ffffff': 'Branco',
  '#c2a278': 'Areia',
  '#90c25e': 'Verde',
  '#4b6629': 'Musgo',
};

function normalizeCharacterColor(hex) {
  const value = String(hex || '').trim().toLowerCase();
  return value.startsWith('#') ? value : '#' + value;
}

function colorLabel(hex) {
  return COLOR_LABELS[normalizeCharacterColor(hex)] || hex;
}

function findUserById(userId) {
  return Object.values(staticData.users).find((u) => u.id === userId) || null;
}

function findUserStorageKey(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (staticData.users[t]) return t;
  const keyed = usernameKey(t);
  if (staticData.users[keyed]) return keyed;
  const byId = findUserById(t);
  if (!byId) return null;
  return Object.keys(staticData.users).find((k) => staticData.users[k].id === byId.id) || null;
}

function prunePresence(now) {
  for (const [id, entry] of Object.entries(staticData.presence)) {
    if (now - entry.lastSeen > PRESENCE_STALE_MS) {
      delete staticData.presence[id];
    }
  }
}

function handlePresenceUpdate(userId) {
  const user = findUserById(userId);
  if (!user || user.status !== 'active') {
    return [{ json: { ok: false, error: 'Sessão inválida.', httpStatus: 401 } }];
  }

  const x = Number(body.x);
  const y = Number(body.y);
  const facing = String(body.facing || 'down');

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return [{ json: { ok: false, error: 'Posição inválida.', httpStatus: 400 } }];
  }

  const now = Date.now();
  staticData.presence[userId] = {
    id: userId,
    username: user.username,
    character_color: user.character_color,
    x,
    y,
    facing,
    lastSeen: now,
  };

  user.last_x = x;
  user.last_y = y;
  user.last_facing = facing;
  if (body.map) user.last_map = String(body.map);

  prunePresence(now);

  return [{ json: { ok: true } }];
}

function handlePresenceWorld(userId) {
  const user = findUserById(userId);
  if (!user || user.status !== 'active') {
    return [{ json: { ok: false, error: 'Sessão inválida.', httpStatus: 401 } }];
  }

  const now = Date.now();
  prunePresence(now);

  const onlineIds = new Set();
  for (const p of Object.values(staticData.presence)) {
    if (now - p.lastSeen <= PRESENCE_STALE_MS) onlineIds.add(p.id);
  }

  const players = Object.values(staticData.presence)
    .filter((p) => p.id !== userId && now - p.lastSeen <= PRESENCE_STALE_MS)
    .map((p) => ({
      id: p.id,
      username: p.username,
      character_color: p.character_color,
      x: p.x,
      y: p.y,
      facing: p.facing,
      lastSeen: p.lastSeen,
    }));

  const users = Object.values(staticData.users)
    .filter((u) => u.status === 'active')
    .map((u) => ({
      username: u.username,
      character_color: u.character_color,
      online: onlineIds.has(u.id),
    }))
    .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));

  return [{ json: { ok: true, players, users } }];
}

function handlePresenceLeave(userId) {
  if (userId) delete staticData.presence[userId];
  return [{ json: { ok: true } }];
}

function chatRoomId(userId, peerId) {
  return [userId, peerId].sort().join(':');
}

function pruneLocalChats(now) {
  for (const [roomId, room] of Object.entries(staticData.localChats)) {
    if (now - (room.updatedAt || 0) > LOCAL_CHAT_ROOM_STALE_MS) {
      delete staticData.localChats[roomId];
      continue;
    }
    if (room.messages?.length > LOCAL_CHAT_MAX_MESSAGES) {
      room.messages = room.messages.slice(-LOCAL_CHAT_MAX_MESSAGES);
    }
  }
}

function tilesApart(ax, ay, bx, by, tileW, tileH) {
  const ac = Math.floor(ax / tileW);
  const ar = Math.floor(ay / tileH);
  const bc = Math.floor(bx / tileW);
  const br = Math.floor(by / tileH);
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
}

function arePlayersNearby(userId, peerId, tileW, tileH) {
  const self = staticData.presence[userId];
  const peer = staticData.presence[peerId];
  if (!self || !peer) return false;
  const now = Date.now();
  if (now - self.lastSeen > PRESENCE_STALE_MS) return false;
  if (now - peer.lastSeen > PRESENCE_STALE_MS) return false;
  return tilesApart(self.x, self.y, peer.x, peer.y, tileW, tileH) <= 1;
}

function getOrCreateChatRoom(userId, peerId, now) {
  const roomId = chatRoomId(userId, peerId);
  if (!staticData.localChats[roomId]) {
    staticData.localChats[roomId] = {
      participants: [userId, peerId].sort(),
      messages: [],
      updatedAt: now,
      nextMsgId: 1,
    };
  }
  return staticData.localChats[roomId];
}

function handleLocalChatOpen(userId) {
  const peerId = String(body.peerId || '').trim();
  const tileW = Number(body.tileWidth) || 16;
  const tileH = Number(body.tileHeight) || 16;

  if (!peerId || peerId === userId) {
    return [{ json: { ok: false, error: 'Jogador inválido.', httpStatus: 400 } }];
  }

  const peer = staticData.presence[peerId];
  if (!peer) {
    return [{ json: { ok: false, error: 'Jogador offline.', httpStatus: 404 } }];
  }

  if (!arePlayersNearby(userId, peerId, tileW, tileH)) {
    return [{ json: { ok: false, error: 'Aproxime-se a um tile do jogador.', httpStatus: 403 } }];
  }

  const now = Date.now();
  pruneLocalChats(now);
  getOrCreateChatRoom(userId, peerId, now);

  return [{
    json: {
      ok: true,
      peer: {
        id: peer.id,
        username: peer.username,
        character_color: peer.character_color,
      },
    },
  }];
}

function handleLocalChatSend(userId) {
  const peerId = String(body.peerId || '').trim();
  const text = String(body.text || '').trim();
  const tileW = Number(body.tileWidth) || 16;
  const tileH = Number(body.tileHeight) || 16;

  if (!peerId || peerId === userId) {
    return [{ json: { ok: false, error: 'Jogador inválido.', httpStatus: 400 } }];
  }
  if (!text || text.length > LOCAL_CHAT_MAX_TEXT) {
    return [{ json: { ok: false, error: 'Mensagem inválida.', httpStatus: 400 } }];
  }

  if (!arePlayersNearby(userId, peerId, tileW, tileH)) {
    return [{ json: { ok: false, error: 'fora_de_alcance', httpStatus: 403 } }];
  }

  const now = Date.now();
  pruneLocalChats(now);
  const room = getOrCreateChatRoom(userId, peerId, now);
  const msg = {
    id: room.nextMsgId++,
    from: userId,
    text,
    at: now,
  };
  room.messages.push(msg);
  room.updatedAt = now;

  return [{ json: { ok: true, message: msg } }];
}

function handleLocalChatPoll(userId) {
  const peerId = String(body.peerId || '').trim();
  const after = Number(body.after) || 0;
  const tileW = Number(body.tileWidth) || 16;
  const tileH = Number(body.tileHeight) || 16;

  if (!peerId || peerId === userId) {
    return [{ json: { ok: false, error: 'Jogador inválido.', httpStatus: 400 } }];
  }

  if (!arePlayersNearby(userId, peerId, tileW, tileH)) {
    return [{ json: { ok: false, error: 'fora_de_alcance', httpStatus: 403 } }];
  }

  const now = Date.now();
  pruneLocalChats(now);
  const roomId = chatRoomId(userId, peerId);
  const room = staticData.localChats[roomId];
  const messages = (room?.messages || []).filter((m) => m.id > after);

  const peer = staticData.presence[peerId];
  return [{
    json: {
      ok: true,
      messages,
      peer: peer
        ? { id: peer.id, username: peer.username, character_color: peer.character_color }
        : null,
    },
  }];
}

function handleLocalChatAction(userId) {
  switch (action) {
    case 'local_chat_open': return handleLocalChatOpen(userId);
    case 'local_chat_send': return handleLocalChatSend(userId);
    case 'local_chat_poll': return handleLocalChatPoll(userId);
    default: return null;
  }
}

async function clearMessageButtons(cq) {
  if (!cq?.message?.chat?.id || !cq?.message?.message_id) return;
  try {
    await telegramApi.call(this, 'editMessageReplyMarkup', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (err) {}
}

async function sendApprovalRequest(key, characterColor) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Telegram não configurado no servidor.');
  }

  const user = staticData.users[key];
  if (!user?.id) {
    throw new Error('Usuário pendente sem ID interno.');
  }
  const display = user.username || key;
  const token = user.id;

  await telegramApi.call(this, 'sendMessage', {
    chat_id: TELEGRAM_CHAT_ID,
    text:
      '🎮 Novo cadastro — Insocialidade\\n\\n' +
      '👤 Usuário: ' + display + '\\n' +
      '🎨 Cor: ' + colorLabel(characterColor) + '\\n\\n' +
      'Aprove ou rejeite:',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Aprovar', callback_data: 'approve:' + token },
        { text: '❌ Não aprovar', callback_data: 'reject:' + token },
      ]],
    },
  });
}

async function moderateUser(token, modAction) {
  const key = findUserStorageKey(token);
  const user = key ? staticData.users[key] : null;
  if (!user) return { ok: false, error: 'Usuário não encontrado.' };

  user.status = modAction === 'approve' ? 'active' : 'rejected';
  user.approvedAt = new Date().toISOString();
  staticData.users[key] = user;

  return {
    ok: true,
    text:
      '🎮 Insocialidade — cadastro\\n\\n' +
      '👤 ' + user.username + '\\n' +
      '🎨 ' + colorLabel(user.character_color) + '\\n\\n' +
      (modAction === 'approve'
        ? '✅ Aprovado — já pode entrar.'
        : '❌ Não aprovado.'),
  };
}
`.trim();

const AUTH_CODE = `
${SHARED_HEADER}

const input = $input.first().json;
const body = input.body || {};
const action = body.action;

async function handleRegister() {
  const displayUsername = String(body.username || '').trim();
  const key = usernameKey(displayUsername);
  const password = String(body.password || '');
  const characterColor = normalizeCharacterColor(body.characterColor);

  if (!isValidUsername(displayUsername)) {
    return [{ json: { ok: false, error: 'Usuário inválido. Use 3–20 caracteres: letras (com acentos), números ou _.', httpStatus: 400 } }];
  }
  if (password.length < 4) {
    return [{ json: { ok: false, error: 'Senha muito curta.', httpStatus: 400 } }];
  }
  if (!VALID_CHARACTER_COLORS.has(characterColor)) {
    return [{ json: { ok: false, error: 'Cor inválida. Escolha uma das cores do cadastro.', httpStatus: 400 } }];
  }

  const existing = staticData.users[key];
  if (existing) {
    if (existing.status === 'active') {
      return [{ json: { ok: false, error: 'Este usuário já está em uso.', httpStatus: 409 } }];
    }

    if (existing.status === 'pending') {
      existing.username = displayUsername;
      existing.character_color = characterColor;
      existing.passwordHash = hashPassword(password, existing.salt);
      staticData.users[key] = existing;
      try {
        await sendApprovalRequest.call(this, key, characterColor);
      } catch (err) {
        return [{ json: { ok: false, error: 'Não foi possível enviar a solicitação no Telegram. Abra @InsocialidadeBot e envie /start, depois tente de novo.', httpStatus: 502 } }];
      }
      return [{ json: { ok: true, message: 'Cadastro pendente. Reenviamos a solicitação no Telegram.' } }];
    }

    // rejected — permite novo cadastro com os mesmos dados
  }

  const salt = randomId('s_');
  const userId = randomId('u_');
  staticData.users[key] = {
    id: userId,
    username: displayUsername,
    character_color: characterColor,
    status: 'pending',
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };

  try {
    await sendApprovalRequest.call(this, key, characterColor);
  } catch (err) {
    delete staticData.users[key];
    return [{ json: { ok: false, error: 'Não foi possível enviar a solicitação no Telegram. Abra @InsocialidadeBot e envie /start, depois tente de novo.', httpStatus: 502 } }];
  }

  return [{ json: { ok: true, message: 'Cadastro pendente de aprovação.' } }];
}

async function handleLogin() {
  const displayUsername = String(body.username || '').trim();
  const key = usernameKey(displayUsername);
  const password = String(body.password || '');
  if (!isValidUsername(displayUsername) || password.length < 4) {
    return [{ json: { ok: false, error: 'Usuário ou senha incorretos.', httpStatus: 401 } }];
  }
  const user = staticData.users[key];

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

function handleStatus() {
  const displayUsername = String(body.username || '').trim();
  const key = usernameKey(displayUsername);
  if (!isValidUsername(displayUsername)) {
    return [{ json: { ok: false, error: 'Usuário inválido.', httpStatus: 400 } }];
  }

  const user = staticData.users[key];
  if (!user) {
    return [{ json: { ok: true, status: 'none', username: displayUsername } }];
  }

  return [{ json: { ok: true, status: user.status, username: user.username } }];
}

function handlePresenceAction(userId) {
  switch (action) {
    case 'presence_update': return handlePresenceUpdate(userId);
    case 'presence_world': return handlePresenceWorld(userId);
    case 'presence_leave': return handlePresenceLeave(userId);
    default: return null;
  }
}

return (async () => {
  const authedActions = [
    'presence_update',
    'presence_world',
    'presence_leave',
    'local_chat_open',
    'local_chat_send',
    'local_chat_poll',
  ];

  if (authedActions.includes(action)) {
    const userId = verifyToken(body.token);
    if (!userId) {
      return [{ json: { ok: false, error: 'Sessão inválida.', httpStatus: 401 } }];
    }
    const presenceResult = handlePresenceAction(userId);
    if (presenceResult) return presenceResult;
    const chatResult = handleLocalChatAction(userId);
    if (chatResult) return chatResult;
  }

  switch (action) {
    case 'register': return await handleRegister();
    case 'login': return await handleLogin();
    case 'session': return handleSession();
    case 'status': return handleStatus();
    default:
      return [{ json: { ok: false, error: 'Ação inválida.', httpStatus: 400 } }];
  }
})();
`.trim();

const TELEGRAM_CODE = `
${SHARED_HEADER}

const input = $input.first().json;
const update = input.body || input;
const cq = update.callback_query;

if (!cq) {
  return [{ json: { ok: true } }];
}

const adminId = String(TELEGRAM_CHAT_ID);
if (String(cq.from?.id) !== adminId) {
  try {
    await telegramApi.call(this, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Você não tem permissão para isso.',
      show_alert: true,
    });
  } catch (err) {}
  return [{ json: { ok: true } }];
}

const raw = String(cq.data || '');
const sep = raw.indexOf(':');
const modAction = sep >= 0 ? raw.slice(0, sep) : '';
const token = sep >= 0 ? raw.slice(sep + 1).trim() : '';
const storageKey = findUserStorageKey(token);

if (!['approve', 'reject'].includes(modAction)) {
  try {
    await telegramApi.call(this, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Ação inválida.',
      show_alert: true,
    });
  } catch (err) {}
  await clearMessageButtons.call(this, cq);
  return [{ json: { ok: true } }];
}

if (!storageKey) {
  try {
    await telegramApi.call(this, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Cadastro não encontrado. Peça um novo cadastro no site (botões antigos não funcionam).',
      show_alert: true,
    });
  } catch (err) {}
  await clearMessageButtons.call(this, cq);
  return [{ json: { ok: true } }];
}

const result = await moderateUser(token, modAction);
if (!result.ok) {
  try {
    await telegramApi.call(this, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: result.error,
      show_alert: true,
    });
  } catch (err) {}
  await clearMessageButtons.call(this, cq);
  return [{ json: { ok: true } }];
}

try {
  await telegramApi.call(this, 'answerCallbackQuery', {
    callback_query_id: cq.id,
    text: modAction === 'approve' ? 'Usuário aprovado!' : 'Usuário rejeitado.',
  });
} catch (err) {}

try {
  await telegramApi.call(this, 'editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: result.text,
    reply_markup: { inline_keyboard: [] },
  });
} catch (err) {
  await clearMessageButtons.call(this, cq);
}

return [{ json: { ok: true } }];
`.trim();

const workflow = {
  name: 'Insocialidade Auth',
  nodes: [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'insocialidade-auth',
        responseMode: 'responseNode',
        options: { allowedOrigins: '*' },
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
        httpMethod: 'POST',
        path: 'insocialidade-telegram',
        responseMode: 'responseNode',
        options: {},
      },
      id: 'webhook-telegram',
      name: 'Webhook Telegram',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 220],
      webhookId: 'insocialidade-telegram-hook',
    },
    {
      parameters: { jsCode: AUTH_CODE, mode: 'runOnceForAllItems' },
      id: 'auth-code-post',
      name: 'Auth Handler POST',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 0],
    },
    {
      parameters: { jsCode: TELEGRAM_CODE, mode: 'runOnceForAllItems' },
      id: 'telegram-code',
      name: 'Telegram Callback Handler',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [280, 220],
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json }}',
        options: { responseCode: '={{ $json.httpStatus || 200 }}' },
      },
      id: 'respond-post',
      name: 'Respond POST',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [540, 0],
    },
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={"ok":true}',
        options: { responseCode: 200 },
      },
      id: 'respond-telegram',
      name: 'Respond Telegram',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [540, 220],
    },
  ],
  connections: {
    'Webhook POST': { main: [[{ node: 'Auth Handler POST', type: 'main', index: 0 }]] },
    'Webhook Telegram': { main: [[{ node: 'Telegram Callback Handler', type: 'main', index: 0 }]] },
    'Auth Handler POST': { main: [[{ node: 'Respond POST', type: 'main', index: 0 }]] },
    'Telegram Callback Handler': { main: [[{ node: 'Respond Telegram', type: 'main', index: 0 }]] },
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

  if (bot.username !== 'InsocialidadeBot') {
    console.warn(`Aviso: esperado @InsocialidadeBot, recebido @${bot.username}`);
  }

  return bot;
}

async function configureTelegramWebhook() {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: TELEGRAM_WEBHOOK_URL,
      allowed_updates: ['callback_query'],
      drop_pending_updates: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`setWebhook falhou: ${data.description}`);
  }
  console.log('Telegram webhook:', TELEGRAM_WEBHOOK_URL);
}

async function testAdminMessage() {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: 'Insocialidade: bot configurado. Novos cadastros chegarão aqui com botões de aprovação.',
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(
      `Não foi possível enviar mensagem ao admin (${TELEGRAM_CHAT_ID}): ${data.description}. Envie /start para @InsocialidadeBot.`
    );
  }
}

async function main() {
  await verifyTelegramBot();

  const existing = await api('GET', '/workflows?limit=100');
  const found = existing.data?.find((w) => w.name === 'Insocialidade Auth');

  let workflowId;
  if (found) {
    console.log('Atualizando workflow existente:', found.id);
    const current = await api('GET', `/workflows/${found.id}`);
    const updated = await api('PUT', `/workflows/${found.id}`, {
      ...workflow,
      name: 'Insocialidade Auth',
      staticData: current.staticData || {},
    });
    workflowId = updated.id;
  } else {
    console.log('Criando workflow...');
    const created = await api('POST', '/workflows', workflow);
    workflowId = created.id;
  }

  await api('POST', `/workflows/${workflowId}/activate`);
  console.log('Workflow ativo:', workflowId);

  await configureTelegramWebhook();
  await testAdminMessage();

  console.log('Auth API:', `${N8N_BASE}/webhook/insocialidade-auth`);
  console.log('Admin chat:', TELEGRAM_CHAT_ID);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
