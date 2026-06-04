/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { CONFIG, resolveAsset } from './config.js?v=canvas14';
import { requireAuth, logout } from './auth.js';
import {
  getStoredSession,
  apiPresenceUpdate,
  apiPresenceWorld,
  apiPresenceLeave,
} from './api.js';
import { loadMap } from './canvas/map.js?v=canvas14';
import { createLocalPlayer } from './canvas/player.js?v=canvas14';
import { createGameEngine } from './canvas/engine.js?v=canvas14';

const playerName = document.getElementById('player-name');
const playerAvatar = document.getElementById('player-avatar');
const logoutBtn = document.getElementById('logout-btn');
const gameRoot = document.getElementById('game-root');
const gameCanvas = document.getElementById('game-canvas');
const gameStatus = document.getElementById('game-status');

let engine = null;
let presencePollTimer = null;

function getToken() {
  return getStoredSession()?.token || null;
}

function setStatus(message) {
  if (gameStatus) gameStatus.textContent = message;
}

function paintCanvasMessage(title, detail = '') {
  const rect = gameCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  gameCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  gameCanvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = gameCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#f8f3e6';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(title, 16, 32);
  if (detail) {
    ctx.fillStyle = '#e6d3a3';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(detail, 16, 52);
  }
}

function startPresenceSync(onWorldUpdate) {
  const token = getToken();
  if (!token) return;

  const poll = async () => {
    try {
      const data = await apiPresenceWorld(token);
      onWorldUpdate(data.players || []);
    } catch {
      // ignora falhas temporárias de rede
    }
  };

  void poll();
  presencePollTimer = setInterval(poll, CONFIG.PRESENCE_POLL_MS);
}

function stopPresenceSync() {
  if (presencePollTimer) {
    clearInterval(presencePollTimer);
    presencePollTimer = null;
  }
}

async function init() {
  const profile = await requireAuth();
  if (!profile) return;

  gameRoot.hidden = false;
  playerName.textContent = profile.username;
  playerAvatar.style.backgroundColor = profile.character_color;
  setStatus('Carregando mapa…');
  paintCanvasMessage('Carregando…');

  logoutBtn.addEventListener('click', () => logout());

  const map = await loadMap(resolveAsset(CONFIG.MAP_URL, { bust: true }));
  const localPlayer = createLocalPlayer({
    x: map.spawn.x,
    y: map.spawn.y,
    color: profile.character_color,
    username: profile.username,
  });

  const token = getToken();

  engine = createGameEngine({
    canvas: gameCanvas,
    map,
    localPlayer,
    onMove: token
      ? ({ x, y, facing }) => {
          apiPresenceUpdate(token, { x, y, facing }).catch(() => {});
        }
      : null,
  });

  setStatus('WASD ou setas para mover');
  gameCanvas.focus();

  startPresenceSync((players) => {
    engine?.setRemotePlayers(players);
  });

  window.addEventListener('beforeunload', () => {
    stopPresenceSync();
    engine?.destroy();
    if (token) {
      navigator.sendBeacon(
        CONFIG.API_URL,
        new Blob(
          [JSON.stringify({ action: 'presence_leave', token })],
          { type: 'application/json' }
        )
      );
    }
  });
}

init().catch((err) => {
  console.error('[Insocialidade]', err);
  gameRoot.hidden = false;
  const message = String(err.message || err);
  setStatus(`Erro: ${message}`);
  paintCanvasMessage('Erro ao carregar o jogo.', message);
});
