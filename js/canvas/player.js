/**
 * Sprite procedural pixelado — quadrado com pernas.
 */

import { moveWithCollision } from './collision.js?v=canvas15';

const BODY_PX = 6;
const LEG_PX = 1;
const LEG_H_PX = 2;
const SPRITE_H_PX = BODY_PX + LEG_H_PX;

const LEG_OFFSETS = [0, 1];
const OUTLINE_PX = 0.5;

export function createLocalPlayer({ x, y, color, username }) {
  return {
    id: 'local',
    x,
    y,
    color,
    username,
    facing: 'down',
    moving: false,
    animFrame: 0,
    animTimer: 0,
  };
}

const INTERP_DELAY_MS = 100;
const MAX_EXTRAPOLATE_SEC = 0.35;
const TELEPORT_THRESHOLD = 64;

export function createRemotePlayer({ id, x, y, color, username, facing }) {
  const now = performance.now();
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    serverX: x,
    serverY: y,
    prevTime: now,
    serverTime: now,
    vx: 0,
    vy: 0,
    bufferInit: true,
    color,
    username,
    facing: facing || 'down',
    moving: false,
    animFrame: 0,
    animTimer: 0,
  };
}

/** Registra novo snapshot de posição vindo do servidor (polling). */
export function syncRemotePlayer(remote, data) {
  const x = Number(data.x);
  const y = Number(data.y);
  const now = performance.now();

  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  if (!remote.bufferInit) {
    remote.x = x;
    remote.y = y;
    remote.prevX = x;
    remote.prevY = y;
    remote.serverX = x;
    remote.serverY = y;
    remote.prevTime = now;
    remote.serverTime = now;
    remote.vx = 0;
    remote.vy = 0;
    remote.bufferInit = true;
    remote.facing = data.facing || remote.facing || 'down';
    return;
  }

  const jump = Math.hypot(x - remote.serverX, y - remote.serverY);
  if (jump > TELEPORT_THRESHOLD) {
    remote.x = x;
    remote.y = y;
    remote.prevX = x;
    remote.prevY = y;
    remote.serverX = x;
    remote.serverY = y;
    remote.prevTime = now;
    remote.serverTime = now;
    remote.vx = 0;
    remote.vy = 0;
    remote.facing = data.facing || remote.facing;
    return;
  }

  remote.prevX = remote.serverX;
  remote.prevY = remote.serverY;
  remote.prevTime = remote.serverTime;
  remote.serverX = x;
  remote.serverY = y;
  remote.serverTime = now;

  const dt = (remote.serverTime - remote.prevTime) / 1000;
  if (dt > 0.016) {
    remote.vx = (remote.serverX - remote.prevX) / dt;
    remote.vy = (remote.serverY - remote.prevY) / dt;
  } else {
    remote.vx = 0;
    remote.vy = 0;
  }

  const speed = Math.hypot(remote.vx, remote.vy);
  if (speed < 12) {
    remote.facing = data.facing || remote.facing;
  }
}

export function updateLocalPlayer(player, dt, map, input, speed) {
  const { dx, dy, moving } = input.getDirection();
  player.moving = moving;

  if (moving) {
    if (Math.abs(dx) > Math.abs(dy)) {
      player.facing = dx > 0 ? 'right' : 'left';
    } else {
      player.facing = dy > 0 ? 'down' : 'up';
    }

    const next = moveWithCollision(
      map,
      player.x,
      player.y,
      dx * speed * dt,
      dy * speed * dt
    );
    player.x = next.x;
    player.y = next.y;

    player.animTimer += dt;
    if (player.animTimer >= 0.12) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % 2;
    }
  } else {
    player.animFrame = 0;
    player.animTimer = 0;
  }

  return player;
}

export function updateRemotePlayer(player, dt) {
  if (!player.bufferInit) return player;

  const now = performance.now();
  const renderTime = now - INTERP_DELAY_MS;
  let x;
  let y;

  const t0 = player.prevTime;
  const t1 = player.serverTime;

  if (renderTime <= t0) {
    x = player.prevX;
    y = player.prevY;
  } else if (t1 <= t0) {
    x = player.serverX;
    y = player.serverY;
  } else if (renderTime < t1) {
    const alpha = (renderTime - t0) / (t1 - t0);
    x = player.prevX + (player.serverX - player.prevX) * alpha;
    y = player.prevY + (player.serverY - player.prevY) * alpha;
  } else {
    const extra = Math.min(MAX_EXTRAPOLATE_SEC, (renderTime - t1) / 1000);
    x = player.serverX + (player.vx || 0) * extra;
    y = player.serverY + (player.vy || 0) * extra;
  }

  const mdx = x - player.x;
  const mdy = y - player.y;
  player.x = x;
  player.y = y;

  const vx = player.vx || 0;
  const vy = player.vy || 0;
  const speed = Math.hypot(vx, vy);
  player.moving = speed > 10 || Math.hypot(mdx, mdy) > 0.08;

  if (player.moving) {
    const faceDx = speed > 10 ? vx : mdx;
    const faceDy = speed > 10 ? vy : mdy;
    if (Math.abs(faceDx) > Math.abs(faceDy)) {
      player.facing = faceDx > 0 ? 'right' : 'left';
    } else if (Math.abs(faceDy) > 0.01) {
      player.facing = faceDy > 0 ? 'down' : 'up';
    }

    player.animTimer += dt;
    if (player.animTimer >= 0.12) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % 2;
    }
  } else {
    player.animFrame = 0;
    player.animTimer = 0;
  }

  return player;
}

function buildSpriteMask(legShift) {
  const mask = Array.from({ length: SPRITE_H_PX }, () => Array(BODY_PX).fill(false));
  for (let y = 0; y < BODY_PX; y++) {
    for (let x = 0; x < BODY_PX; x++) mask[y][x] = true;
  }
  for (let dy = 0; dy < LEG_H_PX; dy++) {
    mask[BODY_PX + dy][1 + legShift] = true;
    mask[BODY_PX + dy][4 - legShift] = true;
  }
  return mask;
}

function maskFilled(mask, x, y) {
  return y >= 0 && y < SPRITE_H_PX && x >= 0 && x < BODY_PX && mask[y][x];
}

function drawSpriteOutline(ctx, originX, originY, px, mask) {
  const t = OUTLINE_PX;
  ctx.fillStyle = '#000';
  for (let y = 0; y < SPRITE_H_PX; y++) {
    for (let x = 0; x < BODY_PX; x++) {
      if (!mask[y][x]) continue;
      const rx = originX + x * px;
      const ry = originY + y * px;
      if (!maskFilled(mask, x, y - 1)) {
        ctx.fillRect(rx - t, ry - t, px + 2 * t, t);
      }
      if (!maskFilled(mask, x, y + 1)) {
        ctx.fillRect(rx - t, ry + px, px + 2 * t, t);
      }
      if (!maskFilled(mask, x - 1, y)) {
        ctx.fillRect(rx - t, ry - t, t, px + 2 * t);
      }
      if (!maskFilled(mask, x + 1, y)) {
        ctx.fillRect(rx + px, ry - t, t, px + 2 * t);
      }
    }
  }
}

function drawSpriteFill(ctx, originX, originY, px, mask, color) {
  ctx.fillStyle = color;
  for (let y = 0; y < SPRITE_H_PX; y++) {
    for (let x = 0; x < BODY_PX; x++) {
      if (!mask[y][x]) continue;
      ctx.fillRect(originX + x * px, originY + y * px, px, px);
    }
  }
}

export function drawPlayer(ctx, player, cameraX, cameraY, scale, { showLabel = false } = {}) {
  const screenX = Math.round((player.x - cameraX) * scale);
  const screenY = Math.round((player.y - cameraY) * scale);
  const px = scale;

  const bodyColor = player.color || '#222233';
  const bodyW = BODY_PX * px;
  const bodyX = screenX - bodyW / 2;
  const bodyY = screenY - SPRITE_H_PX * px;

  const legShift = player.moving ? LEG_OFFSETS[player.animFrame] : 0;
  const mask = buildSpriteMask(legShift);
  drawSpriteOutline(ctx, bodyX, bodyY, px, mask);
  drawSpriteFill(ctx, bodyX, bodyY, px, mask, bodyColor);

  if (showLabel && player.username) {
    ctx.font = `${Math.max(8, 6 * px)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8f3e6';
    ctx.strokeStyle = '#222233';
    ctx.lineWidth = 2;
    const labelY = bodyY - 2 * px;
    ctx.strokeText(player.username, screenX, labelY);
    ctx.fillText(player.username, screenX, labelY);
  }
}
