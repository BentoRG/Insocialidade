/**
 * Motor principal — loop, câmera, render.
 */

import { createInput } from './input.js';
import {
  updateLocalPlayer,
  updateRemotePlayer,
  drawPlayer,
} from './player.js';

const MOVE_SPEED = 70;
const BASE_ZOOM = 3;
const PRESENCE_SEND_MS = 200;

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

  let scale = BASE_ZOOM;
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;
  let running = true;
  let lastTime = performance.now();
  let lastPresenceSend = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    scale = BASE_ZOOM;
    viewW = rect.width / scale;
    viewH = rect.height / scale;
  }

  function setRemotePlayers(players) {
    const ids = new Set();

    for (const data of players) {
      ids.add(data.id);
      let remote = remotePlayers.get(data.id);
      if (!remote) {
        remotePlayers.set(data.id, {
          id: data.id,
          x: data.x,
          y: data.y,
          targetX: data.x,
          targetY: data.y,
          color: data.character_color,
          username: data.username,
          facing: data.facing || 'down',
          moving: false,
          animFrame: 0,
          animTimer: 0,
        });
      } else {
        remote.targetX = data.x;
        remote.targetY = data.y;
        remote.color = data.character_color;
        remote.username = data.username;
        remote.facing = data.facing || remote.facing;
      }
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

    updateLocalPlayer(localPlayer, dt, map, input, MOVE_SPEED);

    for (const remote of remotePlayers.values()) {
      updateRemotePlayer(remote, dt);
    }

    const camera = computeCamera(localPlayer, map, viewW, viewH);
    render(camera);

    if (onMove && now - lastPresenceSend >= PRESENCE_SEND_MS) {
      lastPresenceSend = now;
      onMove({
        x: Math.round(localPlayer.x),
        y: Math.round(localPlayer.y),
        facing: localPlayer.facing,
      });
    }

    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);

  requestAnimationFrame(tick);

  return {
    setRemotePlayers,
    destroy() {
      running = false;
      input.destroy();
      window.removeEventListener('resize', resize);
      resizeObserver.disconnect();
    },
  };
}
