/**
 * Sprite sheet de skins do jogador — load, frames e desenho com tinte/outline.
 */

import { resolveAsset } from '../config.js';
import { REGISTRATION_PLACEHOLDER_COLOR } from '../skins.js?v=skins3';

export const FRAME_W = 6;
export const FRAME_H = 8;
export const FRAMES_PER_SKIN = 2;
export const SKIN_SLOT_COUNT = 20;

const OUTLINE_PX = 1;
const SHEET_URL = 'assets/characters/player-skins.png';
const PLACEHOLDER_RGB = hexToRgb(REGISTRATION_PLACEHOLDER_COLOR);
const COLOR_MATCH_TOLERANCE = 8;

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '');
  if (normalized.length !== 6) return [0, 0, 0];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function parseCssColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b };
}

function matchesPlaceholder(r, g, b) {
  return (
    Math.abs(r - PLACEHOLDER_RGB[0]) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(g - PLACEHOLDER_RGB[1]) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(b - PLACEHOLDER_RGB[2]) <= COLOR_MATCH_TOLERANCE
  );
}

let sheetImage = null;
let loadPromise = null;

let tintCanvas = null;
let tintCtx = null;
let alphaCanvas = null;
let alphaCtx = null;

function ensureOffscreen() {
  if (typeof document === 'undefined') return;
  if (!tintCanvas) {
    tintCanvas = document.createElement('canvas');
    tintCanvas.width = FRAME_W;
    tintCanvas.height = FRAME_H;
    tintCtx = tintCanvas.getContext('2d');
    alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = FRAME_W;
    alphaCanvas.height = FRAME_H;
    alphaCtx = alphaCanvas.getContext('2d');
  }
}

export function getSkinFrameRect(skinIndex, animFrame) {
  const row = Math.max(0, Math.min(SKIN_SLOT_COUNT - 1, skinIndex));
  const frame = Math.max(0, Math.min(FRAMES_PER_SKIN - 1, animFrame));
  return {
    sx: frame * FRAME_W,
    sy: row * FRAME_H,
    sw: FRAME_W,
    sh: FRAME_H,
  };
}

export function loadPlayerSpriteSheet() {
  if (sheetImage) return Promise.resolve(sheetImage);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      sheetImage = img;
      resolve(sheetImage);
    };
    img.onerror = () => reject(new Error(`Falha ao carregar sprite sheet: ${SHEET_URL}`));
    img.src = resolveAsset(SHEET_URL, { bust: true });
  });

  return loadPromise;
}

export function getPlayerSpriteSheet() {
  return sheetImage;
}

function maskFilled(mask, col, row) {
  return row >= 0 && row < mask.length && col >= 0 && col < mask[0].length && mask[row][col];
}

function alphaMaskFromFrame(sheet, sx, sy) {
  ensureOffscreen();
  if (!alphaCtx || !sheet) return null;

  alphaCtx.clearRect(0, 0, FRAME_W, FRAME_H);
  alphaCtx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  const data = alphaCtx.getImageData(0, 0, FRAME_W, FRAME_H).data;
  const mask = Array.from({ length: FRAME_H }, () => Array(FRAME_W).fill(false));

  for (let row = 0; row < FRAME_H; row++) {
    for (let col = 0; col < FRAME_W; col++) {
      mask[row][col] = data[(row * FRAME_W + col) * 4 + 3] > 0;
    }
  }

  return mask;
}

function drawOutlineFromMask(ctx, originX, originY, px, mask) {
  const t = OUTLINE_PX;
  ctx.fillStyle = '#000';

  for (let row = 0; row < FRAME_H; row++) {
    for (let col = 0; col < FRAME_W; col++) {
      if (!mask[row][col]) continue;

      const rx = originX + col * px;
      const ry = originY + row * px;

      if (!maskFilled(mask, col, row - 1)) {
        ctx.fillRect(rx - t, ry - t, px + 2 * t, t);
      }
      if (!maskFilled(mask, col, row + 1)) {
        ctx.fillRect(rx - t, ry + px, px + 2 * t, t);
      }
      if (!maskFilled(mask, col - 1, row)) {
        ctx.fillRect(rx - t, ry - t, t, px + 2 * t);
      }
      if (!maskFilled(mask, col + 1, row)) {
        ctx.fillRect(rx + px, ry - t, t, px + 2 * t);
      }
    }
  }
}

function drawFullTintedFrame(ctx, sheet, sx, sy, destX, destY, scale, color) {
  ensureOffscreen();
  if (!tintCtx || !sheet) return false;

  tintCtx.clearRect(0, 0, FRAME_W, FRAME_H);
  tintCtx.globalCompositeOperation = 'source-over';
  tintCtx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, FRAME_W, FRAME_H);
  tintCtx.globalCompositeOperation = 'source-over';

  ctx.drawImage(
    tintCanvas,
    0,
    0,
    FRAME_W,
    FRAME_H,
    destX,
    destY,
    FRAME_W * scale,
    FRAME_H * scale
  );
  return true;
}

function drawPlaceholderTintedFrame(ctx, sheet, sx, sy, destX, destY, scale, color) {
  ensureOffscreen();
  if (!tintCtx || !sheet) return false;

  tintCtx.clearRect(0, 0, FRAME_W, FRAME_H);
  tintCtx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);

  const imageData = tintCtx.getImageData(0, 0, FRAME_W, FRAME_H);
  const data = imageData.data;
  const { r: pr, g: pg, b: pb } = parseCssColor(color);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (matchesPlaceholder(data[i], data[i + 1], data[i + 2])) {
      data[i] = pr;
      data[i + 1] = pg;
      data[i + 2] = pb;
    }
  }

  tintCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(
    tintCanvas,
    0,
    0,
    FRAME_W,
    FRAME_H,
    destX,
    destY,
    FRAME_W * scale,
    FRAME_H * scale
  );
  return true;
}

function drawRawFrame(ctx, sheet, sx, sy, destX, destY, scale) {
  ctx.drawImage(
    sheet,
    sx,
    sy,
    FRAME_W,
    FRAME_H,
    destX,
    destY,
    FRAME_W * scale,
    FRAME_H * scale
  );
}

function frameHasPixels(sheet, sx, sy) {
  ensureOffscreen();
  if (!alphaCtx || !sheet) return false;
  alphaCtx.clearRect(0, 0, FRAME_W, FRAME_H);
  alphaCtx.drawImage(sheet, sx, sy, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  const data = alphaCtx.getImageData(0, 0, FRAME_W, FRAME_H).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) return true;
  }
  return false;
}

/**
 * Desenha um frame de skin ancorado pelos pés em (feetX, feetY) no espaço de tela.
 */
export function drawSkinFrame(
  ctx,
  {
    sheet = sheetImage,
    skinIndex = 0,
    animFrame = 0,
    feetX,
    feetY,
    scale = 1,
    color = '#4a4a4a',
    tint = 'full',
    showOutline = true,
  } = {}
) {
  if (!sheet) return false;

  const { sx, sy } = getSkinFrameRect(skinIndex, animFrame);
  if (!frameHasPixels(sheet, sx, sy)) return false;

  const destX = feetX - (FRAME_W * scale) / 2;
  const destY = feetY - FRAME_H * scale;
  const mask = showOutline ? alphaMaskFromFrame(sheet, sx, sy) : null;
  const tintMode = tint === true ? 'full' : tint;

  if (showOutline && mask) {
    drawOutlineFromMask(ctx, destX, destY, scale, mask);
  }

  if (tintMode === 'full') {
    drawFullTintedFrame(ctx, sheet, sx, sy, destX, destY, scale, color);
  } else if (tintMode === 'placeholder') {
    drawPlaceholderTintedFrame(ctx, sheet, sx, sy, destX, destY, scale, color);
  } else {
    drawRawFrame(ctx, sheet, sx, sy, destX, destY, scale);
  }

  return true;
}

export function getPlayerAnimFrame(player) {
  return player.moving ? player.animFrame % FRAMES_PER_SKIN : 0;
}

export { SHEET_URL };
