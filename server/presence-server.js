#!/usr/bin/env node
/**
 * Servidor Insocialidade — auth HTTP, presença, chat local e jogadores online.
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createAuthStore } from './auth-store.js';
import { createTelegramApprovalHandler } from './telegram-approval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

const PORT = Number(process.env.PRESENCE_WS_PORT || 8787);
const SESSION_SECRET = process.env.SESSION_SECRET || 'insocialidade-session-v1';
const APPROVAL_SECRET = process.env.APPROVAL_SECRET || 'insocialidade-approve-2026';
const N8N_APPROVAL_WEBHOOK_URL =
  process.env.N8N_APPROVAL_WEBHOOK_URL ||
  'http://127.0.0.1:5678/webhook/insocialidade-approval-notify';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '8670179404';
const WS_PATH = process.env.PRESENCE_WS_PATH || '/ws';
const authStore = createAuthStore({ sessionSecret: SESSION_SECRET });
const handleTelegramUpdate = TELEGRAM_BOT_TOKEN
  ? createTelegramApprovalHandler({
      botToken: TELEGRAM_BOT_TOKEN,
      adminChatId: TELEGRAM_ADMIN_CHAT_ID,
      moderateUser: (payload) => authStore.moderateUser(payload),
    })
  : null;
const STALE_MS = Number(process.env.PRESENCE_STALE_MS || 15000);
const CHAT_TILE_RADIUS = 2;
const CHAT_MAX_TEXT = 500;
const CHAT_ROOM_STALE_MS = 30 * 60 * 1000;
const CHAT_REQUEST_STALE_MS = 60 * 1000;
const CHAT_MAX_MESSAGES = 200;
const DEFAULT_TILE = 16;

/** @type {Map<string, Map<string, ClientState>>} */
const rooms = new Map();

/** @type {Map<string, ChatRoom>} */
const chatRooms = new Map();

/** @type {Map<string, ChatRequest>} */
const pendingChatRequests = new Map();

function verifyToken(token) {
  return authStore.verifyToken(token);
}

const CORS_ORIGINS = new Set([
  'https://bentorg.github.io',
  'https://gepetodigital.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && (CORS_ORIGINS.has(origin) || origin.endsWith('.github.io'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        rejectBody(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        rejectBody(new Error('JSON inválido'));
      }
    });
    req.on('error', rejectBody);
  });
}

function notifyApproval({ userId, username, characterColor }) {
  if (!N8N_APPROVAL_WEBHOOK_URL) return;
  fetch(N8N_APPROVAL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username, characterColor }),
  }).catch((err) => {
    console.warn('Falha ao notificar n8n:', err.message || err);
  });
}

function listMembers({ token }) {
  const session = authStore.validateSession({ token });
  if (!session.ok) {
    return session;
  }

  return {
    ok: true,
    users: authStore.listAccountMembers(),
  };
}

async function handleAuthRoute(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: 'Corpo inválido.' });
    return;
  }

  const action = body.action;
  let result;

  switch (action) {
    case 'register':
      result = await authStore.register(body);
      if (result.ok && result.notify) {
        notifyApproval(result.notify);
        delete result.notify;
      }
      break;
    case 'login':
      result = authStore.login(body);
      break;
    case 'session':
      result = authStore.validateSession(body);
      break;
    case 'status':
      result = authStore.checkStatus(body);
      break;
    case 'members':
      result = listMembers(body);
      break;
    default:
      sendJson(res, 400, { ok: false, error: 'Ação inválida.' });
      return;
  }

  sendJson(res, result.httpStatus || (result.ok ? 200 : 400), result);
}

async function handleModerateRoute(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: 'Corpo inválido.' });
    return;
  }

  if (body.secret !== APPROVAL_SECRET) {
    sendJson(res, 403, { ok: false, error: 'Não autorizado.' });
    return;
  }

  const action = body.action;
  if (!['approve', 'reject'].includes(action)) {
    sendJson(res, 400, { ok: false, error: 'Ação inválida.' });
    return;
  }

  const result = await authStore.moderateUser({ userId: body.userId, action });
  sendJson(res, result.ok ? 200 : 404, result);
}

async function handleTelegramRoute(req, res) {
  if (!handleTelegramUpdate) {
    sendJson(res, 503, { ok: false, error: 'Telegram não configurado.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { ok: false, error: 'Corpo inválido.' });
    return;
  }

  try {
    const result = await handleTelegramUpdate(body);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('Telegram webhook:', err.message || err);
    sendJson(res, 500, { ok: false, error: 'Erro interno.' });
  }
}

async function handleHttpRequest(req, res) {
  setCorsHeaders(req, res);

  if (
    req.method === 'OPTIONS' &&
    (req.url === '/auth' || req.url === '/auth/moderate' || req.url === '/auth/telegram')
  ) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/auth') {
    await handleAuthRoute(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/auth/moderate') {
    await handleModerateRoute(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/auth/telegram') {
    await handleTelegramRoute(req, res);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Insocialidade server\n');
}

function getRoom(mapId) {
  const key = String(mapId || 'default');
  if (!rooms.has(key)) rooms.set(key, new Map());
  return rooms.get(key);
}

function publicPlayer(client) {
  return {
    id: client.id,
    username: client.username,
    character_color: client.character_color,
    x: client.x,
    y: client.y,
    facing: client.facing,
    moving: client.moving,
  };
}

function membersForRoom(room) {
  const onlineIds = new Set([...room.values()].map((client) => client.id));

  return authStore.listAccountMembers().map((member) => ({
    ...member,
    online: onlineIds.has(member.id),
  }));
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room, exceptId, payload) {
  for (const [id, client] of room.entries()) {
    if (id !== exceptId) send(client.ws, payload);
  }
}

function broadcastUsers(room) {
  const users = membersForRoom(room);
  for (const client of room.values()) {
    send(client.ws, { type: 'users', users });
  }
}

function removeClient(client) {
  if (!client?.roomId || !client?.id) return;
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.delete(client.id);
  if (room.size === 0) rooms.delete(client.roomId);
  else {
    broadcastRoom(room, client.id, { type: 'leave', id: client.id });
    broadcastUsers(room);
  }
}

function pruneStaleRooms() {
  const now = Date.now();
  for (const [mapId, room] of rooms.entries()) {
    for (const [id, client] of room.entries()) {
      if (now - client.lastSeen > STALE_MS) {
        client.ws.close(4000, 'stale');
        room.delete(id);
      }
    }
    if (room.size === 0) rooms.delete(mapId);
    else broadcastUsers(room);
  }
}

function chatRoomId(userId, peerId) {
  return [userId, peerId].sort().join(':');
}

function pruneChatRooms(now) {
  for (const [roomId, room] of chatRooms.entries()) {
    if (now - (room.updatedAt || 0) > CHAT_ROOM_STALE_MS) {
      chatRooms.delete(roomId);
      continue;
    }
    if (room.messages.length > CHAT_MAX_MESSAGES) {
      room.messages = room.messages.slice(-CHAT_MAX_MESSAGES);
    }
  }
}

function pruneChatRequests(now) {
  for (const [requestId, request] of pendingChatRequests.entries()) {
    if (now - (request.updatedAt || 0) > CHAT_REQUEST_STALE_MS) {
      pendingChatRequests.delete(requestId);
    }
  }
}

function pruneClientChatRequests(client) {
  for (const [requestId, request] of pendingChatRequests.entries()) {
    if (!request.participants.includes(client.id)) continue;

    const peerId = request.participants.find((id) => id !== client.id);
    const peer = peerId ? findClientById(peerId) : null;
    if (!peer || peer.roomId !== client.roomId || !areClientsNearby(client, peer)) {
      pendingChatRequests.delete(requestId);
    }
  }
}

function pruneClientChatRooms(client) {
  for (const [roomId, room] of chatRooms.entries()) {
    if (!room.participants.includes(client.id)) continue;

    const peerId = room.participants.find((id) => id !== client.id);
    const peer = peerId ? findClientById(peerId) : null;
    if (!peer || peer.roomId !== client.roomId || !areClientsNearby(client, peer)) {
      chatRooms.delete(roomId);
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

function findClientById(peerId) {
  for (const room of rooms.values()) {
    const client = room.get(peerId);
    if (client) return client;
  }
  return null;
}

function areClientsNearby(self, peer, tileW = DEFAULT_TILE, tileH = DEFAULT_TILE) {
  if (!self || !peer) return false;
  return tilesApart(self.x, self.y, peer.x, peer.y, tileW, tileH) <= CHAT_TILE_RADIUS;
}

function syncClientPosition(client, msg) {
  const x = Number(msg.x);
  const y = Number(msg.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  client.x = x;
  client.y = y;
  client.lastSeen = Date.now();
}

function createFreshChatRoom(userId, peerId, now) {
  const roomId = chatRoomId(userId, peerId);
  chatRooms.set(roomId, {
    participants: [userId, peerId].sort(),
    messages: [],
    updatedAt: now,
    nextMsgId: 1,
  });
  return chatRooms.get(roomId);
}

function sendChatError(ws, error) {
  send(ws, { type: 'chat_error', error });
}

function sendChatOpened(client, peer, messages) {
  send(client.ws, {
    type: 'chat_opened',
    peer: {
      id: peer.id,
      username: peer.username,
      character_color: peer.character_color,
    },
    messages,
  });
}

function deliverChatMessage(userId, peerId, message) {
  const self = findClientById(userId);
  const peer = findClientById(peerId);
  if (self) {
    send(self.ws, {
      type: 'chat_message',
      peerId,
      peer: peer ? publicPlayer(peer) : null,
      message,
    });
  }
  if (peer) {
    send(peer.ws, {
      type: 'chat_message',
      peerId: userId,
      peer: self ? publicPlayer(self) : null,
      message,
    });
  }
}

function messageUsername(message, client, peer) {
  if (message.username) return message.username;
  if (message.from === client.id) return client.username;
  if (message.from === peer.id) return peer.username;
  return findClientById(message.from)?.username || 'Jogador';
}

function resolveReplyTo(room, replyTo, client, peer) {
  const replyId = Number(replyTo?.id);
  if (!Number.isSafeInteger(replyId) || replyId <= 0) return null;

  const original = room.messages.find((message) => message.id === replyId);
  if (!original) return null;

  return {
    id: original.id,
    from: original.from,
    username: messageUsername(original, client, peer),
    text: original.text,
  };
}

function handleChatRequest(client, msg) {
  const peerId = String(msg.peerId || '').trim();
  const tileW = Number(msg.tileWidth) || DEFAULT_TILE;
  const tileH = Number(msg.tileHeight) || DEFAULT_TILE;
  syncClientPosition(client, msg);

  if (!peerId || peerId === client.id) {
    sendChatError(client.ws, 'Jogador inválido.');
    return;
  }

  const peer = findClientById(peerId);
  if (!peer || peer.roomId !== client.roomId) {
    sendChatError(client.ws, 'Jogador offline.');
    return;
  }

  if (!areClientsNearby(client, peer, tileW, tileH)) {
    pendingChatRequests.delete(chatRoomId(client.id, peerId));
    sendChatError(client.ws, 'Aproxime-se do jogador (até 2 tiles).');
    return;
  }

  const now = Date.now();
  pruneChatRequests(now);
  pruneChatRooms(now);
  const requestId = chatRoomId(client.id, peerId);
  const request = pendingChatRequests.get(requestId) || {
    participants: [client.id, peerId].sort(),
    requestedBy: new Set(),
    updatedAt: now,
  };

  request.requestedBy.add(client.id);
  request.updatedAt = now;
  pendingChatRequests.set(requestId, request);

  if (!request.requestedBy.has(peerId)) {
    send(client.ws, {
      type: 'chat_pending',
      peerId,
      peer: publicPlayer(peer),
    });
    send(peer.ws, {
      type: 'chat_request_received',
      peerId: client.id,
      peer: publicPlayer(client),
    });
    return;
  }

  pendingChatRequests.delete(requestId);
  const room = createFreshChatRoom(client.id, peerId, now);
  sendChatOpened(client, peer, room.messages);
  sendChatOpened(peer, client, room.messages);
}

function handleChatAccept(client, msg) {
  const peerId = String(msg.peerId || '').trim();
  const tileW = Number(msg.tileWidth) || DEFAULT_TILE;
  const tileH = Number(msg.tileHeight) || DEFAULT_TILE;
  syncClientPosition(client, msg);

  if (!peerId || peerId === client.id) {
    sendChatError(client.ws, 'Jogador inválido.');
    return;
  }

  const peer = findClientById(peerId);
  if (!peer || peer.roomId !== client.roomId) {
    sendChatError(client.ws, 'Jogador offline.');
    return;
  }

  if (!areClientsNearby(client, peer, tileW, tileH)) {
    pendingChatRequests.delete(chatRoomId(client.id, peerId));
    sendChatError(client.ws, 'Aproxime-se do jogador (até 2 tiles).');
    return;
  }

  const now = Date.now();
  pruneChatRequests(now);
  pruneChatRooms(now);

  const requestId = chatRoomId(client.id, peerId);
  const request = pendingChatRequests.get(requestId);
  if (!request?.requestedBy?.has(peerId)) {
    sendChatError(client.ws, 'Nenhum pedido de chat pendente.');
    return;
  }

  pendingChatRequests.delete(requestId);
  const room = createFreshChatRoom(client.id, peerId, now);
  sendChatOpened(client, peer, room.messages);
  sendChatOpened(peer, client, room.messages);
}

function handleChatSend(client, msg) {
  const peerId = String(msg.peerId || '').trim();
  const text = String(msg.text || '').trim();
  const tileW = Number(msg.tileWidth) || DEFAULT_TILE;
  const tileH = Number(msg.tileHeight) || DEFAULT_TILE;
  syncClientPosition(client, msg);

  if (!peerId || peerId === client.id) {
    sendChatError(client.ws, 'Jogador inválido.');
    return;
  }
  if (!text || text.length > CHAT_MAX_TEXT) {
    sendChatError(client.ws, 'Mensagem inválida.');
    return;
  }

  const peer = findClientById(peerId);
  if (!peer) {
    sendChatError(client.ws, 'Jogador offline.');
    return;
  }

  if (!areClientsNearby(client, peer, tileW, tileH)) {
    chatRooms.delete(chatRoomId(client.id, peerId));
    sendChatError(client.ws, 'fora_de_alcance');
    return;
  }

  const now = Date.now();
  pruneChatRooms(now);
  const room = chatRooms.get(chatRoomId(client.id, peerId));
  if (!room) {
    sendChatError(client.ws, 'Nenhum chat ativo.');
    return;
  }
  const replyTo = resolveReplyTo(room, msg.replyTo, client, peer);
  const message = {
    id: room.nextMsgId++,
    from: client.id,
    username: client.username,
    text,
    at: now,
  };
  if (replyTo) message.replyTo = replyTo;
  room.messages.push(message);
  room.updatedAt = now;

  deliverChatMessage(client.id, peerId, message);
}

/** @typedef {{ ws: import('ws').WebSocket, id: string, roomId: string, username: string, character_color: string, x: number, y: number, facing: string, moving: boolean, lastSeen: number }} ClientState */
/** @typedef {{ participants: string[], messages: object[], updatedAt: number, nextMsgId: number }} ChatRoom */
/** @typedef {{ participants: string[], requestedBy: Set<string>, updatedAt: number }} ChatRequest */

const server = createServer((req, res) => {
  handleHttpRequest(req, res).catch((err) => {
    console.error('HTTP error:', err.message || err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Erro interno.' });
  });
});

const wss = new WebSocketServer({ server, path: WS_PATH });

wss.on('connection', (ws) => {
  /** @type {ClientState | null} */
  let client = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: 'error', message: 'JSON inválido.' });
      return;
    }

    if (msg.type === 'join') {
      const userId = verifyToken(msg.token);
      if (!userId) {
        send(ws, { type: 'error', message: 'Sessão inválida.' });
        ws.close(4001, 'auth');
        return;
      }

      if (client) removeClient(client);

      const roomId = String(msg.map || 'default');
      const room = getRoom(roomId);
      const existing = room.get(userId);
      if (existing && existing.ws !== ws) {
        existing.ws.close(4002, 'replaced');
        room.delete(userId);
      }

      client = {
        ws,
        id: userId,
        roomId,
        username: String(msg.username || userId),
        character_color: String(msg.character_color || '#4a4a4a'),
        x: Number(msg.x) || 0,
        y: Number(msg.y) || 0,
        facing: String(msg.facing || 'down'),
        moving: Boolean(msg.moving),
        lastSeen: Date.now(),
      };
      room.set(userId, client);

      send(ws, {
        type: 'world',
        players: [...room.values()]
          .filter((entry) => entry.id !== userId)
          .map(publicPlayer),
      });
      send(ws, { type: 'users', users: membersForRoom(room) });

      broadcastRoom(room, userId, { type: 'join', player: publicPlayer(client) });
      broadcastUsers(room);
      return;
    }

    if (!client) {
      send(ws, { type: 'error', message: 'Envie join antes de outras ações.' });
      return;
    }

    if (msg.type === 'move') {
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      client.x = x;
      client.y = y;
      client.facing = String(msg.facing || client.facing);
      client.moving = Boolean(msg.moving);
      client.lastSeen = Date.now();
      pruneClientChatRequests(client);
      pruneClientChatRooms(client);

      const room = getRoom(client.roomId);
      broadcastRoom(room, client.id, {
        type: 'move',
        id: client.id,
        x: client.x,
        y: client.y,
        facing: client.facing,
        moving: client.moving,
        t: client.lastSeen,
      });
      return;
    }

    if (msg.type === 'chat_request' || msg.type === 'chat_open') {
      handleChatRequest(client, msg);
      return;
    }

    if (msg.type === 'chat_accept') {
      handleChatAccept(client, msg);
      return;
    }

    if (msg.type === 'chat_send') {
      handleChatSend(client, msg);
    }
  });

  ws.on('close', () => {
    if (client) removeClient(client);
  });
});

setInterval(pruneStaleRooms, 5000);
setInterval(() => pruneChatRooms(Date.now()), 60000);
setInterval(() => pruneChatRequests(Date.now()), 30000);

server.listen(PORT, () => {
  console.log(`Auth API em http://127.0.0.1:${PORT}/auth`);
  console.log(`Telegram webhook em http://127.0.0.1:${PORT}/auth/telegram`);
  console.log(`Realtime WS em http://127.0.0.1:${PORT}${WS_PATH}`);
});
