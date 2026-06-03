/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { CONFIG } from './config.js';
import { requireAuth, logout } from './auth.js';
import {
  getStoredSession,
  apiPresenceUpdate,
  apiPresenceWorld,
  apiPresenceLeave,
} from './api.js';
import { loadMap } from './canvas/map.js';
import { createLocalPlayer } from './canvas/player.js';
import { createGameEngine } from './canvas/engine.js';

const playerName = document.getElementById('player-name');
const playerAvatar = document.getElementById('player-avatar');
const logoutBtn = document.getElementById('logout-btn');
const gameRoot = document.getElementById('game-root');
const gameCanvas = document.getElementById('game-canvas');

let engine = null;
let presencePollTimer = null;

function getToken() {
  return getStoredSession()?.token || null;
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

async function leavePresence() {
  const token = getToken();
  if (!token) return;

  try {
    await apiPresenceLeave(token);
  } catch {
    // best effort
  }
}

async function init() {
  const profile = await requireAuth();
  if (!profile) return;

  gameRoot.hidden = false;
  playerName.textContent = profile.username;
  playerAvatar.style.backgroundColor = profile.character_color;

  logoutBtn.addEventListener('click', () => logout());

  const map = await loadMap(CONFIG.MAP_URL);
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
});
