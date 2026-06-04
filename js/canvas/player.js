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

const INTERP_DELAY_MS = 120;
const MAX_EXTRAPOLATE_MS = 1200;
const EXTRAPOLATE_DECAY_MS = 250;
const TELEPORT_THRESHOLD = 140;
const MAX_MOVE_SPEED = 70;
const HISTORY_LIMIT = 24;
const SMOOTH_RATE = 22;

function capVelocity(vx, vy) {
  const speed = Math.hypot(vx, vy);
  if (speed <= MAX_MOVE_SPEED || speed < 0.001) return { vx, vy };
  const scale = MAX_MOVE_SPEED / speed;
  return { vx: vx * scale, vy: vy * scale };
}

function snapRemote(remote, x, y, t, facing, lastSeen = null) {
  remote.history = [{ x, y, t }];
  remote.x = x;
  remote.y = y;
  remote.vx = 0;
  remote.vy = 0;
  remote.targetX = x;
  remote.targetY = y;
  remote.lastSeen = lastSeen;
  if (facing) remote.facing = facing;
}

function updateVelocity(remote) {
  const history = remote.history;
  if (history.length < 2) {
    remote.vx = 0;
    remote.vy = 0;
    return;
  }

  const latest = history[history.length - 1];
  let prev = history[history.length - 2];
  for (let i = history.length - 2; i >= 0; i--) {
    const candidate = history[i];
    if (latest.t - candidate.t >= 24) {
      prev = candidate;
      break;
    }
    prev = candidate;
  }

  const dt = (latest.t - prev.t) / 1000;
  if (dt <= 0.008) {
    remote.vx = 0;
    remote.vy = 0;
    return;
  }

  const vel = capVelocity((latest.x - prev.x) / dt, (latest.y - prev.y) / dt);
  remote.vx = vel.vx;
  remote.vy = vel.vy;
}

function pushSnapshot(remote, x, y, t, facing) {
  const history = remote.history;
  const last = history[history.length - 1];
  if (last && last.x === x && last.y === y && t - last.t < 12) {
    if (facing) remote.facing = facing;
    return;
  }

  history.push({ x, y, t });
  while (history.length > HISTORY_LIMIT) history.shift();
  updateVelocity(remote);
  if (facing) remote.facing = facing;
}

function extrapolatePosition(remote, latest, extraMs) {
  const cappedMs = Math.min(MAX_EXTRAPOLATE_MS, extraMs);
  const extraSec = cappedMs / 1000;
  const decay =
    extraMs <= EXTRAPOLATE_DECAY_MS
      ? 1
      : Math.pow(0.82, (extraMs - EXTRAPOLATE_DECAY_MS) / 80);
  return {
    x: latest.x + remote.vx * extraSec * decay,
    y: latest.y + remote.vy * extraSec * decay,
  };
}

function sampleHistory(remote, renderTime) {
  const history = remote.history;
  if (!history.length) return null;

  if (renderTime <= history[0].t) {
    return { x: history[0].x, y: history[0].y };
  }

  const latest = history[history.length - 1];
  if (renderTime >= latest.t) {
    return extrapolatePosition(remote, latest, renderTime - latest.t);
  }

  for (let i = 1; i < history.length; i++) {
    const b = history[i];
    if (renderTime < b.t) {
      const a = history[i - 1];
      const span = b.t - a.t;
      const alpha = span > 0 ? (renderTime - a.t) / span : 1;
      return {
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
      };
    }
  }

  return { x: latest.x, y: latest.y };
}

export function createRemotePlayer({ id, x, y, color, username, facing }) {
  const now = performance.now();
  return {
    id,
    x,
    y,
    targetX: x,
    targetY: y,
    history: [{ x, y, t: now }],
    lastSeen: null,
    vx: 0,
    vy: 0,
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
  const seen = Number(data.lastSeen);
  const hasSeen = Number.isFinite(seen);
  const facing = data.facing || remote.facing;
  const receivedAt = performance.now();

  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  if (hasSeen && remote.lastSeen != null) {
    if (seen < remote.lastSeen) return;
    if (seen === remote.lastSeen) {
      const latest = remote.history[remote.history.length - 1];
      if (latest && latest.x === x && latest.y === y) return;
    }
  }

  const latest = remote.history[remote.history.length - 1];
  const jump = latest ? Math.hypot(x - latest.x, y - latest.y) : 0;
  const seenMs = hasSeen ? seen : null;

  if (jump > TELEPORT_THRESHOLD || !latest) {
    snapRemote(remote, x, y, receivedAt, facing, seenMs);
    return;
  }

  pushSnapshot(remote, x, y, receivedAt, facing);
  if (hasSeen) remote.lastSeen = seen;
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
  const sample = sampleHistory(player, performance.now() - INTERP_DELAY_MS);
  if (!sample) return player;

  player.targetX = sample.x;
  player.targetY = sample.y;

  const smooth = 1 - Math.exp(-SMOOTH_RATE * dt);
  const mdx = player.targetX - player.x;
  const mdy = player.targetY - player.y;
  player.x += mdx * smooth;
  player.y += mdy * smooth;

  const vx = player.vx || 0;
  const vy = player.vy || 0;
  const speed = Math.hypot(vx, vy);
  player.moving = speed > 6 || Math.hypot(mdx, mdy) > 0.02;

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
