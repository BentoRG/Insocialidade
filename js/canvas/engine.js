/**
 * Motor principal — loop, câmera, render.
 */

import { createInput } from './input.js?v=canvas18';
import { createMinimap } from './minimap.js?v=canvas33';
import {
  createRemotePlayer,
  syncRemotePlayer,
  updateLocalPlayer,
  updateRemotePlayer,
  drawPlayer,
} from './player.js?v=canvas27';

const MOVE_SPEED = 70;
const BASE_ZOOM = 3;
const FULLSCREEN_ZOOM = 5;
const PRESENCE_SEND_MS = 33;
const PAUSED_MINIMAP_HEIGHT = 0.8;
const PAUSE_OVERLAY = 'rgba(0, 0, 0, 0.35)';
const REGION_LABEL_BG = 'rgba(0, 0, 0, 0.55)';
const REGION_LABEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const REGION_LABEL_TEXT = '#f8f3e6';
const REGION_LABEL_FONT = 12;
const REGION_LABEL_FONT_FULLSCREEN = 18;

function drawRegionLabel(ctx, regionName, screenW, { fullscreen = false } = {}) {
  if (!regionName) return;

  const fontSize = fullscreen ? REGION_LABEL_FONT_FULLSCREEN : REGION_LABEL_FONT;
  const padX = fullscreen ? 14 : 10;
  const padY = fullscreen ? 8 : 6;
  const top = fullscreen ? 12 : 8;

  ctx.save();
  ctx.font = `${fontSize}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const textW = ctx.measureText(regionName).width;
  const panelW = textW + padX * 2;
  const panelH = fontSize + padY * 2;
  const x = Math.round((screenW - panelW) / 2);

  ctx.fillStyle = REGION_LABEL_BG;
  ctx.fillRect(x, top, panelW, panelH);
  ctx.strokeStyle = REGION_LABEL_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, top + 0.5, panelW - 1, panelH - 1);

  ctx.fillStyle = REGION_LABEL_TEXT;
  ctx.fillText(regionName, screenW / 2, top + padY);
  ctx.restore();
}

function computeCamera(localPlayer, map, viewW, viewH) {
  let camX = localPlayer.x - viewW / 2;
  let camY = localPlayer.y - viewH / 2;

  camX = Math.max(0, Math.min(map.pixelWidth - viewW, camX));
  camY = Math.max(0, Math.min(map.pixelHeight - viewH, camY));

  return { x: camX, y: camY };
}

export function createGameEngine({ canvas, map, localPlayer, onMove }) {
  const ctx = canvas.getContext('2d');
  const minimap = createMinimap(map);
  const input = createInput();
  const remotePlayers = new Map();
  const tickListeners = new Set();

  let scale = BASE_ZOOM;
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;
  let running = true;
  let lastTime = performance.now();
  let lastPresenceSend = 0;
  let lastSentX = localPlayer.x;
  let lastSentY = localPlayer.y;
  let lastSentFacing = localPlayer.facing;
  let lastSentMoving = localPlayer.moving;
  let resizeObserver = null;
  let paused = false;

  function isFullscreen() {
    const root = canvas.closest('#game-root');
    const fs =
      document.fullscreenElement || document.webkitFullscreenElement || null;
    return Boolean(root && fs === root);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    scale = isFullscreen() ? FULLSCREEN_ZOOM : BASE_ZOOM;

    viewW = rect.width / scale;
    viewH = rect.height / scale;
  }

  function setRemotePlayers(players) {
    const ids = new Set();

    for (const data of players) {
      ids.add(data.id);
      let remote = remotePlayers.get(data.id);
      if (!remote) {
        remote = createRemotePlayer({
          id: data.id,
          x: data.x,
          y: data.y,
          color: data.character_color,
          username: data.username,
          facing: data.facing,
        });
        remotePlayers.set(data.id, remote);
      }
      syncRemotePlayer(remote, data);
      remote.color = data.character_color;
      remote.username = data.username;
    }

    for (const id of remotePlayers.keys()) {
      if (!ids.has(id)) remotePlayers.delete(id);
    }
  }

  function render(camera) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    map.draw(ctx, camera.x, camera.y, viewW, viewH, scale);

    for (const remote of remotePlayers.values()) {
      drawPlayer(ctx, remote, camera.x, camera.y, scale, {
        showLabel: true,
        labelVariant: 'remote',
      });
    }

    drawPlayer(ctx, localPlayer, camera.x, camera.y, scale, {
      showLabel: true,
      labelVariant: 'local',
    });

    const screenW = canvas.width / dpr;
    const screenH = canvas.height / dpr;

    if (paused) {
      ctx.fillStyle = PAUSE_OVERLAY;
      ctx.fillRect(0, 0, screenW, screenH);

      minimap.draw(ctx, {
        camera,
        viewW,
        viewH,
        screenW,
        screenH,
        heightFraction: PAUSED_MINIMAP_HEIGHT,
      });
    }

    const regionName = map.getRegionNameAt?.(localPlayer.x, localPlayer.y);
    drawRegionLabel(ctx, regionName, screenW, { fullscreen: isFullscreen() });
  }

  function tick(now) {
    if (!running) return;

    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (viewW <= 0 || viewH <= 0) {
      resize();
      requestAnimationFrame(tick);
      return;
    }

    if (!paused) {
      updateLocalPlayer(localPlayer, dt, map, input, MOVE_SPEED);

      for (const remote of remotePlayers.values()) {
        updateRemotePlayer(remote, dt);
      }
    }

    for (const listener of tickListeners) {
      listener({
        localPlayer,
        remotePlayers: Array.from(remotePlayers.values()),
      });
    }

    const camera = computeCamera(localPlayer, map, viewW, viewH);
    render(camera);

    if (onMove && !paused) {
      const moved =
        Math.hypot(localPlayer.x - lastSentX, localPlayer.y - lastSentY) > 0.05;
      const turned = localPlayer.facing !== lastSentFacing;
      const movingChanged = localPlayer.moving !== lastSentMoving;
      const due = now - lastPresenceSend >= PRESENCE_SEND_MS;
      if (due || moved || turned || movingChanged) {
        lastPresenceSend = now;
        lastSentX = localPlayer.x;
        lastSentY = localPlayer.y;
        lastSentFacing = localPlayer.facing;
        lastSentMoving = localPlayer.moving;
        onMove({
          x: localPlayer.x,
          y: localPlayer.y,
          facing: localPlayer.facing,
          moving: localPlayer.moving,
        });
      }
    }

    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  document.addEventListener('webkitfullscreenchange', resize);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);
    const wrap = canvas.parentElement;
    if (wrap) resizeObserver.observe(wrap);
  }

  requestAnimationFrame(tick);

  return {
    setRemotePlayers,
    resize,
    isPaused: () => paused,
    togglePause() {
      paused = !paused;
      if (paused) {
        localPlayer.moving = false;
        input.clear();
      }
      return paused;
    },
    getLocalPlayer: () => localPlayer,
    getRemotePlayers: () => Array.from(remotePlayers.values()),
    getTileSize: () => ({ tileWidth: map.tileWidth, tileHeight: map.tileHeight }),
    addTickListener(fn) {
      tickListeners.add(fn);
      return () => tickListeners.delete(fn);
    },
    destroy() {
      running = false;
      tickListeners.clear();
      input.destroy();
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', resize);
      document.removeEventListener('webkitfullscreenchange', resize);
      resizeObserver?.disconnect();
    },
  };
}
