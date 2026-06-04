/**
 * Motor principal — loop, câmera, render.
 */

import { createInput } from './input.js?v=canvas18';
import {
  createRemotePlayer,
  syncRemotePlayer,
  updateLocalPlayer,
  updateRemotePlayer,
  drawPlayer,
} from './player.js?v=canvas26';

const MOVE_SPEED = 70;
const BASE_ZOOM = 3;
const FULLSCREEN_ZOOM = 5;
const PRESENCE_SEND_MS = 33;

function computeCamera(localPlayer, map, viewW, viewH) {
  let camX = localPlayer.x - viewW / 2;
  let camY = localPlayer.y - viewH / 2;

  camX = Math.max(0, Math.min(map.pixelWidth - viewW, camX));
  camY = Math.max(0, Math.min(map.pixelHeight - viewH, camY));

  return { x: camX, y: camY };
}

export function createGameEngine({ canvas, map, localPlayer, onMove }) {
  const ctx = canvas.getContext('2d');
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
      drawPlayer(ctx, remote, camera.x, camera.y, scale, { showLabel: true });
    }

    drawPlayer(ctx, localPlayer, camera.x, camera.y, scale);
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

    updateLocalPlayer(localPlayer, dt, map, input, MOVE_SPEED);

    for (const remote of remotePlayers.values()) {
      updateRemotePlayer(remote, dt);
    }

    for (const listener of tickListeners) {
      listener({
        localPlayer,
        remotePlayers: Array.from(remotePlayers.values()),
      });
    }

    const camera = computeCamera(localPlayer, map, viewW, viewH);
    render(camera);

    if (onMove) {
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
