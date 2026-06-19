/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { CONFIG, resolveAsset } from './config.js?v=auth16';
import { requireAuth, logout } from './auth.js';
import { getStoredSession, apiListMembers } from './api.js';
import { loadMap } from './canvas/map.js?v=canvas21';
import { createLocalPlayer } from './canvas/player.js?v=canvas29';
import { createGameEngine } from './canvas/engine.js?v=canvas39';
import { resolvePlayerSpawn, saveLocalPosition, getCurrentMapId } from './spawn.js?v=spawn1';
import { createLocalChat } from './local-chat.js?v=chat19';
import { createRealtimePresence } from './realtime.js?v=rt8';

const playerName = document.getElementById('player-name');
const playerAvatar = document.getElementById('player-avatar');
const logoutBtn = document.getElementById('logout-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const pauseBtn = document.getElementById('pause-btn');
const exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
const gameRoot = document.getElementById('game-root');
const gameCanvas = document.getElementById('game-canvas');
const gameStatus = document.getElementById('game-status');
const usersList = document.getElementById('users-list');

let engine = null;
let localChat = null;
let realtime = null;
let removeChatTick = null;
let removeKeyboardShortcuts = null;
/** @type {Array<{id: string, username: string, character_color: string}>} */
let memberDirectory = [];

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

function updatePauseButton(engine) {
  if (!pauseBtn) return;
  const active = engine.isPaused();
  pauseBtn.textContent = active ? 'Continuar' : 'Pausar';
  pauseBtn.setAttribute('aria-pressed', String(active));
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function setupKeyboardShortcuts(engine) {
  function onKeyDown(e) {
    if (e.repeat || isTypingTarget(e.target)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      engine.togglePause();
      updatePauseButton(engine);
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      void toggleFullscreen();
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
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
    empty.textContent = 'Nenhum membro cadastrado.';
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
    usersList.appendChild(item);
  }
}

function renderMemberDirectory() {
  renderUsersList(memberDirectory);
}

function syncPresenceUsers(users = []) {
  if (memberDirectory.length || !users.length) return;

  memberDirectory = users.map(({ id, username, character_color }) => ({
    id,
    username,
    character_color,
  }));
  renderMemberDirectory();
}

async function loadMemberDirectory(token) {
  if (!token) {
    memberDirectory = [];
    renderUsersList([]);
    return;
  }

  try {
    const data = await apiListMembers(token);
    memberDirectory = Array.isArray(data.users) ? data.users : [];
  } catch {
    memberDirectory = [];
  }

  renderMemberDirectory();
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
  const mapId = map.id || getCurrentMapId(CONFIG.MAP_URL);
  const userKey = profile.id || profile.username;
  const spawn = resolvePlayerSpawn(map, mapId, profile, userKey);

  const localPlayer = createLocalPlayer({
    x: spawn.x,
    y: spawn.y,
    color: profile.character_color,
    username: profile.username,
  });
  localPlayer.facing = spawn.facing;

  const token = getToken();
  await loadMemberDirectory(token);

  engine = createGameEngine({
    canvas: gameCanvas,
    map,
    localPlayer,
    onMove: token
      ? (state) => {
          saveLocalPosition(userKey, { map: mapId, x: state.x, y: state.y, facing: state.facing });
          realtime?.sendMove(state);
        }
      : null,
  });

  pauseBtn?.addEventListener('click', () => {
    engine.togglePause();
    updatePauseButton(engine);
  });
  updatePauseButton(engine);
  removeKeyboardShortcuts = setupKeyboardShortcuts(engine);

  localChat = createLocalChat({
    nearbyEl: document.getElementById('local-chat-nearby'),
    activeEl: document.getElementById('local-chat-active'),
    messagesEl: document.getElementById('local-chat-messages'),
    formEl: document.getElementById('local-chat-form'),
    inputEl: document.getElementById('local-chat-input'),
    getLocalPlayer: () => engine.getLocalPlayer(),
    getRemotePlayers: () => engine.getRemotePlayers(),
    getTileSize: () => engine.getTileSize(),
    localUserId: profile.id,
    localUsername: profile.username,
    getRealtime: () => realtime,
  });

  realtime = createRealtimePresence({
    url: CONFIG.REALTIME_WS_URL,
    token,
    mapId,
    profile,
    spawn,
    onPlayers: (players) => {
      engine?.setRemotePlayers(players);
      localChat?.update();
    },
    onUsers: (users) => {
      syncPresenceUsers(users);
    },
    onStatus: (message) => {
      if (message) setStatus(message);
    },
    onChatOpened: (msg) => {
      localChat?.handleChatOpened(msg);
    },
    onChatPending: (msg) => {
      localChat?.handleChatPending(msg);
    },
    onChatRequest: (msg) => {
      localChat?.handleChatRequest(msg);
    },
    onChatMessage: (msg) => {
      localChat?.handleChatMessage(msg);
    },
    onChatError: (error) => {
      localChat?.handleChatError(error);
    },
  });

  removeChatTick = engine.addTickListener(() => localChat?.update());

  await waitForLayout();
  engine.resize();
  localChat.update();
  setStatus('WASD ou setas para mover');
  gameCanvas.focus();

  window.addEventListener('beforeunload', () => {
    removeKeyboardShortcuts?.();
    realtime?.destroy();
    removeChatTick?.();
    localChat?.destroy();
    engine?.destroy();
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
