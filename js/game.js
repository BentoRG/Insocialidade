/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { CONFIG, resolveAsset } from './config.js?v=palette4';
import { requireAuth, logout } from './auth.js';
import {
  getStoredSession,
  apiPresenceUpdate,
  apiPresenceWorld,
  apiPresenceLeave,
} from './api.js';
import { loadMap } from './canvas/map.js?v=canvas17';
import { createLocalPlayer } from './canvas/player.js?v=canvas17';
import { createGameEngine } from './canvas/engine.js?v=canvas17';

const playerName = document.getElementById('player-name');
const playerAvatar = document.getElementById('player-avatar');
const logoutBtn = document.getElementById('logout-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
const gameRoot = document.getElementById('game-root');
const gameCanvas = document.getElementById('game-canvas');
const gameStatus = document.getElementById('game-status');
const usersList = document.getElementById('users-list');

let engine = null;
let presencePollTimer = null;

function getToken() {
  return getStoredSession()?.token || null;
}

function setStatus(message) {
  if (gameStatus) gameStatus.textContent = message;
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    null
  );
}

function isFullscreen() {
  return getFullscreenElement() === gameRoot;
}

async function exitFullscreen() {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {
    setStatus('Não foi possível sair da tela cheia.');
  }
}

async function enterFullscreen() {
  if (!gameRoot) return;
  try {
    if (gameRoot.requestFullscreen) {
      await gameRoot.requestFullscreen();
    } else if (gameRoot.webkitRequestFullscreen) {
      await gameRoot.webkitRequestFullscreen();
    }
  } catch {
    setStatus('Não foi possível entrar em tela cheia.');
  }
}

async function toggleFullscreen() {
  if (isFullscreen()) {
    await exitFullscreen();
  } else {
    await enterFullscreen();
  }
}

function updateFullscreenButton() {
  if (!fullscreenBtn) return;
  const active = isFullscreen();
  fullscreenBtn.textContent = active ? 'Sair da tela cheia' : 'Tela cheia';
  fullscreenBtn.setAttribute('aria-pressed', String(active));
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

function renderUsersList(users = []) {
  if (!usersList) return;

  usersList.replaceChildren();

  if (!users.length) {
    const empty = document.createElement('li');
    empty.className = 'game-users__empty';
    empty.textContent = 'Nenhuma conta ativa.';
    usersList.appendChild(empty);
    return;
  }

  for (const user of users) {
    const item = document.createElement('li');
    item.className = 'game-users__item';

    const swatch = document.createElement('span');
    swatch.className = 'game-users__swatch';
    swatch.style.backgroundColor = user.character_color || '#4a4a4a';
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'game-users__name';
    name.textContent = user.username;

    item.append(swatch, name);

    if (user.online) {
      const online = document.createElement('span');
      online.className = 'game-users__online';
      online.textContent = '(online)';
      item.appendChild(online);
    }

    usersList.appendChild(item);
  }
}

function startPresenceSync(onWorldUpdate) {
  const token = getToken();
  if (!token) return;

  const poll = async () => {
    try {
      const data = await apiPresenceWorld(token);
      onWorldUpdate(data.players || [], data.users || []);
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

function waitForLayout() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function init() {
  if (gameRoot) {
    gameRoot.hidden = false;
    setStatus('Verificando sessão…');
  }

  const profile = await requireAuth();
  if (!profile) return;

  playerName.textContent = profile.username;
  playerAvatar.style.backgroundColor = profile.character_color;
  setStatus('Carregando mapa…');
  paintCanvasMessage('Carregando…');
  await waitForLayout();

  logoutBtn?.addEventListener('click', () => logout());
  fullscreenBtn?.addEventListener('click', () => toggleFullscreen());
  exitFullscreenBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void exitFullscreen();
  });
  document.addEventListener('fullscreenchange', updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
  gameCanvas.addEventListener('dblclick', () => toggleFullscreen());
  updateFullscreenButton();

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

  await waitForLayout();
  engine.resize();
  setStatus('WASD ou setas para mover');
  gameCanvas.focus();

  startPresenceSync((players, users) => {
    engine?.setRemotePlayers(players);
    renderUsersList(users);
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

init().catch(async (err) => {
  console.error('[Insocialidade]', err);
  if (gameRoot) gameRoot.hidden = false;
  const message = String(err.message || err);
  setStatus(`Erro: ${message}`);
  await waitForLayout();
  paintCanvasMessage('Erro ao carregar o jogo.', message);
});
