/**
 * Sprite procedural pixelado — quadrado com pernas.
 */

import { moveWithCollision } from './collision.js?v=canvas18';

const BODY_PX = 6;
const LEG_H_PX = 2;
const SPRITE_H_PX = BODY_PX + LEG_H_PX;

const LEG_OFFSETS = [0, 1];
const OUTLINE_PX = 1;

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

const TELEPORT_THRESHOLD = 96;
const REMOTE_LERP_RATE = 36;

export function createRemotePlayer({ id, x, y, color, username, facing }) {
  return {
    id,
    x,
    y,
    targetX: x,
    targetY: y,
    color,
    username,
    facing: facing || 'down',
    targetFacing: facing || 'down',
    moving: false,
    animFrame: 0,
    animTimer: 0,
    initialized: false,
  };
}

/** Atualiza alvo de um jogador remoto (WebSocket em tempo real). */
export function syncRemotePlayer(remote, data) {
  const x = Number(data.x);
  const y = Number(data.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const facing = data.facing || remote.facing;
  const moving = Boolean(data.moving);

  remote.targetX = x;
  remote.targetY = y;
  remote.targetFacing = facing;
  remote.moving = moving;

  if (!remote.initialized) {
    remote.x = x;
    remote.y = y;
    remote.facing = facing;
    remote.initialized = true;
    return;
  }

  const jump = Math.hypot(x - remote.x, y - remote.y);
  if (jump > TELEPORT_THRESHOLD) {
    remote.x = x;
    remote.y = y;
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
  const dx = player.targetX - player.x;
  const dy = player.targetY - player.y;
  const dist = Math.hypot(dx, dy);

  if (dist > TELEPORT_THRESHOLD) {
    player.x = player.targetX;
    player.y = player.targetY;
  } else if (dist > 0.001) {
    const t = 1 - Math.exp(-REMOTE_LERP_RATE * dt);
    player.x += dx * t;
    player.y += dy * t;
  }

  player.facing = player.targetFacing;

  if (player.moving) {
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
  const screenX = (player.x - cameraX) * scale;
  const screenY = (player.y - cameraY) * scale;
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
