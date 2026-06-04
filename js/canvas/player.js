/**
 * Sprite procedural pixelado — quadrado com pernas.
 */

import { moveWithCollision } from './collision.js?v=canvas10';

const BODY_PX = 6;
const LEG_PX = 1;
const LEG_H_PX = 2;
const SPRITE_H_PX = BODY_PX + LEG_H_PX;

const LEG_OFFSETS = [0, 1];

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
    moving: false,
    animFrame: 0,
    animTimer: 0,
  };
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

export function updateRemotePlayer(player, dt, speed) {
  const dx = player.targetX - player.x;
  const dy = player.targetY - player.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 0.5) {
    player.x = player.targetX;
    player.y = player.targetY;
    player.moving = false;
    player.animFrame = 0;
    player.animTimer = 0;
    return player;
  }

  player.moving = true;
  const step = Math.min(dist, speed * dt);
  player.x += (dx / dist) * step;
  player.y += (dy / dist) * step;

  if (Math.abs(dx) > Math.abs(dy)) {
    player.facing = dx > 0 ? 'right' : 'left';
  } else {
    player.facing = dy > 0 ? 'down' : 'up';
  }

  player.animTimer += dt;
  if (player.animTimer >= 0.12) {
    player.animTimer = 0;
    player.animFrame = (player.animFrame + 1) % 2;
  }

  return player;
}

export function drawPlayer(ctx, player, cameraX, cameraY, scale, { showLabel = false } = {}) {
  const screenX = Math.round((player.x - cameraX) * scale);
  const screenY = Math.round((player.y - cameraY) * scale);
  const px = scale;

  const bodyColor = player.color || '#222233';
  const legColor = shadeColor(bodyColor, -20);

  const bodyW = BODY_PX * px;
  const bodyH = BODY_PX * px;
  const bodyX = screenX - bodyW / 2;
  const bodyY = screenY - SPRITE_H_PX * px;

  ctx.fillStyle = bodyColor;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

  const legShift = player.moving ? LEG_OFFSETS[player.animFrame] * px : 0;
  const legY = bodyY + bodyH;
  const legW = LEG_PX * px;
  const legH = LEG_H_PX * px;
  ctx.fillStyle = legColor;
  ctx.fillRect(bodyX + 1 * px + legShift, legY, legW, legH);
  ctx.fillRect(bodyX + 4 * px - legShift, legY, legW, legH);

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

function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amount;
  let g = ((n >> 8) & 0xff) + amount;
  let b = (n & 0xff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
