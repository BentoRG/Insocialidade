#!/usr/bin/env node
/**
 * Servidor WebSocket de presença — movimento em tempo real entre jogadores.
 * Valida o mesmo token de sessão do workflow n8n (Insocialidade Auth).
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

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
const WS_PATH = process.env.PRESENCE_WS_PATH || '/ws/presence';
const STALE_MS = Number(process.env.PRESENCE_STALE_MS || 15000);

/** @type {Map<string, Map<string, ClientState>>} */
const rooms = new Map();

function simpleHash(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) + hash + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (!data?.sub || !data?.iat || !data?.sig) return null;
    if (Date.now() - data.iat > 7 * 24 * 60 * 60 * 1000) return null;
    if (simpleHash(`${SESSION_SECRET}${data.sub}${data.iat}`) !== data.sig) return null;
    return String(data.sub);
  } catch {
    return null;
  }
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

function removeClient(client) {
  if (!client?.roomId || !client?.id) return;
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.delete(client.id);
  if (room.size === 0) rooms.delete(client.roomId);
  else broadcastRoom(room, client.id, { type: 'leave', id: client.id });
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
  }
}

/** @typedef {{ ws: import('ws').WebSocket, id: string, roomId: string, username: string, character_color: string, x: number, y: number, facing: string, moving: boolean, lastSeen: number }} ClientState */

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Insocialidade presence WebSocket\n');
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

      broadcastRoom(room, userId, { type: 'join', player: publicPlayer(client) });
      return;
    }

    if (!client) {
      send(ws, { type: 'error', message: 'Envie join antes de move.' });
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
    }
  });

  ws.on('close', () => {
    if (client) removeClient(client);
  });
});

setInterval(pruneStaleRooms, 5000);

server.listen(PORT, () => {
  console.log(`Presence WS em http://127.0.0.1:${PORT}${WS_PATH}`);
});
