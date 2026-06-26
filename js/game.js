/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { CONFIG, resolveAsset } from './config.js?v=auth21';
import { requireAuth, logout } from './auth.js';
import { getStoredSession, apiListMembers } from './api.js';
import { loadMap, isNearArbusto, isNearTileType, findNearestTileOfType, houseIdFromTile } from './canvas/map.js?v=canvas28';
import { createLocalPlayer } from './canvas/player.js?v=canvas33';
import { loadPlayerSpriteSheet } from './canvas/player-sprites.js?v=sprites3';
import { createGameEngine } from './canvas/engine.js?v=canvas46';
import { createSnakeMinigame } from './canvas/snake-minigame.js?v=snake19';
import { createWardrobeMinigame } from './canvas/wardrobe-minigame.js?v=wardrobe11';
import { createHousePasswordMinigame } from './canvas/house-password-minigame.js?v=housepwd2';
import { createHouseInteriorMinigame } from './canvas/house-interior-minigame.js?v=houseint1';
import { resolvePlayerSpawn, saveLocalPosition, getCurrentMapId } from './spawn.js?v=spawn1';
import { createLocalChat } from './local-chat.js?v=chat19';
import { createRealtimePresence } from './realtime.js?v=rt9';
import { loadSnakeBestScores } from './snake-best-score.js?v=snakebest4';
import { loadSnakeProgress } from './snake-progress.js?v=snakeprog3';
import { loadSkinState } from './skin-store.js?v=skinstore3';

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
const arbustoPromptBtn = document.getElementById('arbusto-prompt-btn');
const casaArmarioPromptBtn = document.getElementById('casa-armario-prompt-btn');
const casaArmarioExitBtn = document.getElementById('casa-armario-exit-btn');
const casaInterativaPromptBtn = document.getElementById('casa-interativa-prompt-btn');
const casaInterativaExitBtn = document.getElementById('casa-interativa-exit-btn');
const casaInterativaChangePwdBtn = document.getElementById('casa-interativa-change-pwd-btn');
const housePasswordPanel = document.getElementById('house-password-panel');
const housePasswordQuestion = document.getElementById('house-password-question');
const housePasswordInput = document.getElementById('house-password-input');
const housePasswordError = document.getElementById('house-password-error');
const housePasswordConfirmBtn = document.getElementById('house-password-confirm-btn');
const housePasswordCancelBtn = document.getElementById('house-password-cancel-btn');
const snakeExitBtn = document.getElementById('snake-exit-btn');
const snakeGameoverPanel = document.getElementById('snake-gameover-panel');
const snakeRetryBtn = document.getElementById('snake-retry-btn');
const snakeGameoverScore = document.getElementById('snake-gameover-score');
const snakeGameoverBest = document.getElementById('snake-gameover-best');
const snakeGameoverExitBtn = document.getElementById('snake-gameover-exit-btn');
const snakePhaseCompletePanel = document.getElementById('snake-phase-complete-panel');
const snakePhaseCompleteTitle = document.getElementById('snake-phase-complete-title');
const snakePhaseCompleteScore = document.getElementById('snake-phase-complete-score');
const snakePhaseCompleteDetail = document.getElementById('snake-phase-complete-detail');
const snakeNextPhaseBtn = document.getElementById('snake-next-phase-btn');
const snakePhaseRetryBtn = document.getElementById('snake-phase-retry-btn');
const snakePhaseExitBtn = document.getElementById('snake-phase-exit-btn');

let engine = null;
let loadedMap = null;
let houseInteriorMap = null;
let localChat = null;
let realtime = null;
let removeChatTick = null;
let removeKeyboardShortcuts = null;
let snakeUserId = null;
let playerProfile = null;
/** @type {Array<{id: string, username: string, character_color: string}>} */
let memberDirectory = [];
/** @type {Set<string>} */
let onlineUserIds = new Set();
/** House enter prompt dismissed until player leaves proximity. */
let dismissedHouseEnterId = null;

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
  if (engine.isMinigameOpen()) {
    pauseBtn.hidden = true;
    return;
  }
  pauseBtn.hidden = false;
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
      if (engine.isMinigameOpen()) return;
      e.preventDefault();
      engine.togglePause();
      updatePauseButton(engine);
      return;
    }

    if (e.code === 'KeyF') {
      e.preventDefault();
      void toggleFullscreen();
      return;
    }

    if (engine.isMinigameOpen() && e.code === 'Enter') {
      e.preventDefault();
      const minigame = engine.getMinigame();
      if (minigame?.getKind?.() === 'snake') {
        retrySnakeMinigame();
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

function updateProximityPrompts() {
  updateArbustoPrompt();
  updateCasaArmarioPrompt();
  updateCasaInterativaPrompt();
}

function countVisiblePrompts() {
  let count = 0;
  if (arbustoPromptBtn && !arbustoPromptBtn.hidden) count += 1;
  if (casaArmarioPromptBtn && !casaArmarioPromptBtn.hidden) count += 1;
  return count;
}

function getNearestInteractiveHouse() {
  if (!engine || !loadedMap) return null;

  const localPlayer = engine.getLocalPlayer();
  const nearTile = findNearestTileOfType(
    loadedMap,
    'casa_interativa',
    localPlayer.x,
    localPlayer.y,
    1
  );
  if (!nearTile) return null;

  const mapId = loadedMap.id || getCurrentMapId(CONFIG.MAP_URL);
  return {
    nearTile,
    houseId: houseIdFromTile(mapId, nearTile.col, nearTile.row),
    exteriorX: localPlayer.x,
    exteriorY: localPlayer.y,
  };
}

function isEnterPasswordOpenForHouse(houseId) {
  const minigame = engine?.getMinigame();
  return (
    engine?.isMinigameOpen() &&
    minigame?.getKind?.() === 'house_password' &&
    minigame?.getMode?.() === 'enter' &&
    minigame?.getHouseId?.() === houseId
  );
}

function updateCasaInterativaProximity() {
  if (!engine || !loadedMap) return;

  const minigame = engine.getMinigame();
  const houseKind = minigame?.getKind?.();
  const nearHouse = getNearestInteractiveHouse();

  if (!nearHouse) {
    dismissedHouseEnterId = null;
    if (houseKind === 'house_password' && minigame?.getMode?.() === 'enter') {
      closeCasaInterativa();
    }
    return;
  }

  if (houseKind === 'house_password' && minigame?.getMode?.() === 'enter') {
    if (minigame.getHouseId?.() !== nearHouse.houseId) {
      closeCasaInterativa();
    }
    return;
  }

  if (engine.isMinigameOpen()) return;
  if (dismissedHouseEnterId === nearHouse.houseId) return;
  if (isEnterPasswordOpenForHouse(nearHouse.houseId)) return;

  openHousePassword({
    mode: 'enter',
    houseId: nearHouse.houseId,
    exteriorX: nearHouse.exteriorX,
    exteriorY: nearHouse.exteriorY,
  });
}

function updateCasaInterativaPrompt() {
  if (!engine || !loadedMap) return;

  const minigame = engine.getMinigame();
  const houseKind = minigame?.getKind?.();

  if (casaInterativaPromptBtn) {
    casaInterativaPromptBtn.hidden = true;
  }

  if (casaInterativaExitBtn) {
    casaInterativaExitBtn.hidden = houseKind !== 'house_interior';
  }
  if (casaInterativaChangePwdBtn) {
    casaInterativaChangePwdBtn.hidden = houseKind !== 'house_interior';
  }
  if (housePasswordPanel && houseKind !== 'house_password') {
    housePasswordPanel.hidden = true;
  }
}

function updateArbustoPrompt() {
  if (!arbustoPromptBtn || !engine || !loadedMap) return;

  const localPlayer = engine.getLocalPlayer();
  const near = isNearArbusto(loadedMap, localPlayer.x, localPlayer.y, 1);
  const show = near && !engine.isMinigameOpen();
  arbustoPromptBtn.hidden = !show;
}

function updateCasaArmarioPrompt() {
  if (!casaArmarioPromptBtn || !engine || !loadedMap) return;

  const minigame = engine.getMinigame();
  const wardrobeOpen = engine.isMinigameOpen() && minigame?.getKind?.() === 'wardrobe';
  const localPlayer = engine.getLocalPlayer();
  const near = isNearTileType(loadedMap, 'casa_armario', localPlayer.x, localPlayer.y, 1);
  const showArbusto = arbustoPromptBtn && !arbustoPromptBtn.hidden;
  const show = near && !engine.isMinigameOpen();

  casaArmarioPromptBtn.hidden = !show;
  casaArmarioPromptBtn.classList.toggle('is-stacked', show && showArbusto);

  if (casaArmarioExitBtn) {
    casaArmarioExitBtn.hidden = !wardrobeOpen;
  }
}

function updateWardrobeControls() {
  const minigame = engine?.getMinigame();
  const open = Boolean(engine?.isMinigameOpen() && minigame?.getKind?.() === 'wardrobe');

  if (casaArmarioExitBtn) casaArmarioExitBtn.hidden = !open;
  if (open) {
    if (arbustoPromptBtn) arbustoPromptBtn.hidden = true;
    if (casaArmarioPromptBtn) casaArmarioPromptBtn.hidden = true;
    if (casaInterativaPromptBtn) casaInterativaPromptBtn.hidden = true;
  }

  updatePauseButton(engine);
}

function updateCasaInterativaControls() {
  const minigame = engine?.getMinigame();
  const kind = minigame?.getKind?.();
  const passwordOpen = Boolean(engine?.isMinigameOpen() && kind === 'house_password');
  const interiorOpen = Boolean(engine?.isMinigameOpen() && kind === 'house_interior');

  if (casaInterativaExitBtn) casaInterativaExitBtn.hidden = !interiorOpen;
  if (casaInterativaChangePwdBtn) casaInterativaChangePwdBtn.hidden = !interiorOpen;
  if (housePasswordPanel) housePasswordPanel.hidden = !passwordOpen;

  if (passwordOpen || interiorOpen) {
    if (arbustoPromptBtn) arbustoPromptBtn.hidden = true;
    if (casaArmarioPromptBtn) casaArmarioPromptBtn.hidden = true;
    if (casaInterativaPromptBtn) casaInterativaPromptBtn.hidden = true;
  }

  updatePauseButton(engine);
}

function updateSnakeControls() {
  const minigame = engine?.getMinigame();
  const open = Boolean(engine?.isMinigameOpen() && minigame?.getKind?.() === 'snake');

  if (!open) {
    if (snakeExitBtn) snakeExitBtn.hidden = true;
    if (snakeGameoverPanel) snakeGameoverPanel.hidden = true;
    if (snakePhaseCompletePanel) snakePhaseCompletePanel.hidden = true;
    updateCasaInterativaControls();
    updateWardrobeControls();
    updateProximityPrompts();
    return;
  }

  const status = minigame.getStatus?.();
  const gameOver = status === 'gameover';
  const phaseComplete = status === 'phase_complete';
  const showOverlay = gameOver || phaseComplete;

  if (snakeGameoverPanel) snakeGameoverPanel.hidden = !gameOver;
  if (snakePhaseCompletePanel) snakePhaseCompletePanel.hidden = !phaseComplete;
  if (snakeExitBtn) snakeExitBtn.hidden = showOverlay;

  if (gameOver && snakeGameoverScore) {
    snakeGameoverScore.textContent = String(minigame.getScore?.() ?? 0);
  }
  if (gameOver && snakeGameoverBest) {
    snakeGameoverBest.textContent = `Recorde nessa fase: ${minigame.getBestScore?.() ?? 0}`;
  }

  if (phaseComplete) {
    const phaseId = minigame.getPhaseId?.() ?? 1;
    const gridSize = minigame.getGridSize?.() ?? 0;
    if (snakePhaseCompleteTitle) {
      snakePhaseCompleteTitle.textContent = `Fase ${phaseId} concluída!`;
    }
    if (snakePhaseCompleteScore) {
      snakePhaseCompleteScore.textContent = String(minigame.getScore?.() ?? 0);
    }
    if (snakePhaseCompleteDetail) {
      snakePhaseCompleteDetail.textContent =
        phaseId >= 3
          ? `Grade ${gridSize}×${gridSize} completa — todas as fases concluídas!`
          : `Grade ${gridSize}×${gridSize} completa — próxima fase desbloqueada`;
    }
    if (snakeNextPhaseBtn) {
      snakeNextPhaseBtn.hidden = !minigame.hasNextPhase?.();
    }
  }

  updatePauseButton(engine);
}

function applyLocalAppearance({ characterColor, skinId }) {
  const localPlayer = engine?.getLocalPlayer();
  if (!localPlayer) return;

  if (characterColor) localPlayer.color = characterColor;
  if (skinId) localPlayer.skinId = skinId;

  if (playerProfile) {
    playerProfile.character_color = characterColor || playerProfile.character_color;
    playerProfile.active_skin_id = skinId || playerProfile.active_skin_id;
  }

  if (playerAvatar && characterColor) {
    playerAvatar.style.backgroundColor = characterColor;
  }

  if (realtime && skinId) {
    realtime.sendSkinUpdate({
      active_skin_id: skinId,
      character_color: characterColor || localPlayer.color,
    });
  }
}

function closeWardrobe() {
  if (!engine) return;
  engine.closeMinigame();
  updateWardrobeControls();
  updateProximityPrompts();
}

function openWardrobe() {
  if (!engine || !snakeUserId || !playerProfile) return;

  const skinState = loadSkinState(snakeUserId, playerProfile);
  if (casaArmarioPromptBtn) casaArmarioPromptBtn.hidden = true;
  if (arbustoPromptBtn) arbustoPromptBtn.hidden = true;

  engine.openMinigame(
    createWardrobeMinigame({
      userId: snakeUserId,
      token: getToken(),
      registrationColor: skinState.registrationColor,
      initialActiveSkinId: skinState.activeSkinId,
      initialUnlockedSkins: skinState.unlockedSkins,
      onEquip: ({ skinId, characterColor }) => {
        applyLocalAppearance({ characterColor, skinId });
      },
      onClose: () => {
        updateWardrobeControls();
        updateProximityPrompts();
      },
    })
  );
  updateWardrobeControls();
}

function getHousePasswordElements() {
  return {
    panelEl: housePasswordPanel,
    inputEl: housePasswordInput,
    errorEl: housePasswordError,
    confirmBtn: housePasswordConfirmBtn,
    cancelBtn: housePasswordCancelBtn,
  };
}

function openHouseInterior({ houseId, exteriorX, exteriorY, interiorState = null }) {
  if (!engine || !houseInteriorMap) return;

  engine.openMinigame(
    createHouseInteriorMinigame({
      localPlayer: engine.getLocalPlayer(),
      interiorMap: houseInteriorMap,
      houseId,
      exteriorX,
      exteriorY,
      onChangePassword: (state) => openChangeHousePassword(state),
      onClose: () => {
        updateCasaInterativaControls();
        updateProximityPrompts();
      },
    })
  );

  const minigame = engine.getMinigame();
  if (interiorState) {
    minigame.restorePosition?.(interiorState);
  }

  updateCasaInterativaControls();
}

function openHousePassword({ mode, houseId, exteriorX, exteriorY, interiorState = null }) {
  if (!engine) return;

  const token = getToken();
  if (!token) return;

  if (housePasswordQuestion) {
    housePasswordQuestion.textContent =
      mode === 'set'
        ? 'Nova senha (4 digitos):'
        : 'Qual eh a senha pra entrar nessa casa?';
  }

  if (casaInterativaPromptBtn) casaInterativaPromptBtn.hidden = true;
  if (arbustoPromptBtn) arbustoPromptBtn.hidden = true;
  if (casaArmarioPromptBtn) casaArmarioPromptBtn.hidden = true;

  engine.openMinigame(
    createHousePasswordMinigame({
      mode,
      houseId,
      token,
      ...getHousePasswordElements(),
      onSuccess: () => {
        dismissedHouseEnterId = null;
        if (mode === 'enter') {
          openHouseInterior({ houseId, exteriorX, exteriorY });
          return;
        }
        openHouseInterior({
          houseId,
          exteriorX: interiorState?.exteriorX ?? exteriorX,
          exteriorY: interiorState?.exteriorY ?? exteriorY,
          interiorState,
        });
      },
      onCancel: () => {
        if (mode === 'set' && interiorState) {
          openHouseInterior({
            houseId,
            exteriorX: interiorState.exteriorX,
            exteriorY: interiorState.exteriorY,
            interiorState,
          });
          return;
        }
        if (mode === 'enter') {
          dismissedHouseEnterId = houseId;
        }
        engine.closeMinigame();
        if (housePasswordPanel) housePasswordPanel.hidden = true;
        updateCasaInterativaControls();
        updateProximityPrompts();
      },
      onClose: () => {
        if (housePasswordPanel) housePasswordPanel.hidden = true;
      },
    })
  );
  updateCasaInterativaControls();
}

function openChangeHousePassword(interiorState) {
  if (!interiorState) return;
  openHousePassword({
    mode: 'set',
    houseId: interiorState.houseId,
    exteriorX: interiorState.exteriorX,
    exteriorY: interiorState.exteriorY,
    interiorState,
  });
}

function closeCasaInterativa() {
  if (!engine) return;
  engine.closeMinigame();
  if (housePasswordPanel) housePasswordPanel.hidden = true;
  updateCasaInterativaControls();
  updateProximityPrompts();
}

function closeSnakeMinigame() {
  if (!engine) return;
  engine.closeMinigame();
  updateSnakeControls();
  updateProximityPrompts();
}

function retrySnakeMinigame() {
  const minigame = engine?.getMinigame();
  if (!minigame || minigame.getStatus?.() !== 'gameover') return;
  minigame.restart?.();
  updateSnakeControls();
}

function retrySnakePhase() {
  const minigame = engine?.getMinigame();
  if (!minigame || minigame.getStatus?.() !== 'phase_complete') return;
  minigame.restart?.();
  updateSnakeControls();
}

function startNextSnakePhase() {
  const minigame = engine?.getMinigame();
  if (!minigame || minigame.getStatus?.() !== 'phase_complete') return;
  if (!minigame.startNextPhase?.()) return;
  updateSnakeControls();
}

async function openSnakeMinigame() {
  if (!engine || !snakeUserId) return;

  const token = getToken();
  const [bestLoad, unlockedPhase] = await Promise.all([
    loadSnakeBestScores(
      snakeUserId,
      token,
      playerProfile?.snake_best_scores ?? playerProfile?.snake_best_score ?? null
    ),
    Promise.resolve(loadSnakeProgress(snakeUserId)),
  ]);
  const bestScores = bestLoad.scores ?? bestLoad;
  if (bestLoad.unlockedSkins && playerProfile) {
    playerProfile.unlocked_skins = bestLoad.unlockedSkins;
  }

  arbustoPromptBtn.hidden = true;
  engine.openMinigame(
    createSnakeMinigame({
      userId: snakeUserId,
      token,
      initialBestScores: bestScores,
      initialUnlockedPhase: unlockedPhase,
      onSkinUnlock: ({ unlockedSkins }) => {
        if (playerProfile && unlockedSkins) {
          playerProfile.unlocked_skins = unlockedSkins;
        }
        updateSnakeControls();
      },
      onClose: () => {
        updateSnakeControls();
        updateProximityPrompts();
      },
    })
  );
  updateSnakeControls();
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

    if (user.online) {
      const online = document.createElement('span');
      online.className = 'game-users__online';
      online.textContent = '(online)';
      item.appendChild(online);
    }

    usersList.appendChild(item);
  }
}

function renderMemberDirectory() {
  renderUsersList(
    memberDirectory.map((member) => ({
      ...member,
      online: onlineUserIds.has(member.id),
    }))
  );
}

function syncPresenceUsers(users = []) {
  if (!users.length) {
    onlineUserIds = new Set();
    renderMemberDirectory();
    return;
  }

  if (!memberDirectory.length) {
    memberDirectory = users.map(({ id, username, character_color }) => ({
      id,
      username,
      character_color,
    }));
  }

  const hasOnlineFlags = users.some((user) => typeof user.online === 'boolean');
  onlineUserIds = new Set();

  for (const user of users) {
    if (!user?.id) continue;
    if (hasOnlineFlags ? user.online : true) {
      onlineUserIds.add(user.id);
    }
  }

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

  const userKey = profile.id || profile.username;
  const skinState = loadSkinState(userKey, profile);

  playerName.textContent = profile.username;
  playerAvatar.style.backgroundColor = skinState.characterColor;
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
  loadedMap = map;
  houseInteriorMap = await loadMap(resolveAsset('assets/maps/house_interior.tmj', { bust: true }));
  await loadPlayerSpriteSheet();
  const mapId = map.id || getCurrentMapId(CONFIG.MAP_URL);
  snakeUserId = userKey;
  playerProfile = profile;
  playerProfile.registration_color = skinState.registrationColor;
  playerProfile.active_skin_id = skinState.activeSkinId;
  playerProfile.unlocked_skins = skinState.unlockedSkins;
  const spawn = resolvePlayerSpawn(map, mapId, profile, userKey);

  const localPlayer = createLocalPlayer({
    x: spawn.x,
    y: spawn.y,
    color: skinState.characterColor,
    registrationColor: skinState.registrationColor,
    skinId: skinState.activeSkinId,
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
    if (engine.isMinigameOpen()) return;
    engine.togglePause();
    updatePauseButton(engine);
  });
  arbustoPromptBtn?.addEventListener('click', () => openSnakeMinigame());
  casaArmarioPromptBtn?.addEventListener('click', () => openWardrobe());
  casaArmarioExitBtn?.addEventListener('click', () => closeWardrobe());
  casaInterativaExitBtn?.addEventListener('click', () => closeCasaInterativa());
  casaInterativaChangePwdBtn?.addEventListener('click', () => {
    const minigame = engine?.getMinigame();
    if (minigame?.getKind?.() === 'house_interior') {
      openChangeHousePassword(minigame.getState?.());
    }
  });
  snakeExitBtn?.addEventListener('click', () => closeSnakeMinigame());
  snakeRetryBtn?.addEventListener('click', () => retrySnakeMinigame());
  snakeGameoverExitBtn?.addEventListener('click', () => closeSnakeMinigame());
  snakeNextPhaseBtn?.addEventListener('click', () => startNextSnakePhase());
  snakePhaseRetryBtn?.addEventListener('click', () => retrySnakePhase());
  snakePhaseExitBtn?.addEventListener('click', () => closeSnakeMinigame());
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

  removeChatTick = engine.addTickListener(() => {
    localChat?.update();
    updateSnakeControls();
    updateCasaInterativaControls();
    updateCasaInterativaProximity();
    updateWardrobeControls();
    updateProximityPrompts();
  });

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
