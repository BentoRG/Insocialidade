/**
 * Sprite procedural pixelado — quadrado com pernas.
 */

import { moveWithCollision } from './collision.js?v=canvas3';

const LEG_OFFSETS = [
  [0, 0],
  [1, 0],
];

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

export function updateRemotePlayer(player, dt) {
  const lerp = Math.min(1, dt * 8);
  player.x += (player.targetX - player.x) * lerp;
  player.y += (player.targetY - player.y) * lerp;

  const dist = Math.hypot(player.targetX - player.x, player.targetY - player.y);
  player.moving = dist > 0.5;

  if (player.moving) {
    player.animTimer += dt;
    if (player.animTimer >= 0.12) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % 2;
    }
  } else {
    player.animFrame = 0;
  }
}

export function drawPlayer(
  ctx,
  player,
  cameraX,
  cameraY,
  scale,
  { showLabel = false, outline = false } = {}
) {
  const screenX = Math.round((player.x - cameraX) * scale);
  const screenY = Math.round((player.y - cameraY) * scale);
  const px = scale;

  const bodyColor = player.color || '#222233';
  const legColor = shadeColor(bodyColor, -20);

  const bodyW = 8 * px;
  const bodyH = 8 * px;
  const bodyX = screenX - bodyW / 2;
  const bodyY = screenY - 12 * px;

  if (outline) {
    ctx.fillStyle = '#f8f3e6';
    ctx.fillRect(bodyX - px, bodyY - px, bodyW + 2 * px, bodyH + 2 * px);
  }

  ctx.fillStyle = bodyColor;
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

  const legShift = player.moving ? LEG_OFFSETS[player.animFrame][0] * px : 0;
  ctx.fillStyle = legColor;
  ctx.fillRect(bodyX + 1 * px + legShift, bodyY + bodyH, 2 * px, 3 * px);
  ctx.fillRect(bodyX + 5 * px - legShift, bodyY + bodyH, 2 * px, 3 * px);

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
