/**
 * Gera assets/characters/player-skins.png — 20 skins × 2 frames (6×8 px).
 * Uso: node scripts/build-player-skin-sheet.js
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../assets/characters/player-skins.png');

const BODY_PX = 6;
const LEG_H_PX = 2;
const SPRITE_H_PX = BODY_PX + LEG_H_PX;
const LEG_OFFSETS = [0, 1];

const FRAME_W = 6;
const FRAME_H = 8;
const FRAMES_PER_SKIN = 2;
const SKIN_COUNT = 20;
const SHEET_W = FRAME_W * FRAMES_PER_SKIN;
const SHEET_H = FRAME_H * SKIN_COUNT;

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

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const combined = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

function writePngRgba(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = rowStart + 1 + x * 4;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      raw[o + 3] = rgba[i + 3];
    }
  }

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, width, x, y, r, g, b, a) {
  const i = (y * width + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

const rgba = new Uint8Array(SHEET_W * SHEET_H * 4);

for (let frame = 0; frame < FRAMES_PER_SKIN; frame++) {
  const mask = buildSpriteMask(LEG_OFFSETS[frame]);
  const offsetX = frame * FRAME_W;
  for (let py = 0; py < SPRITE_H_PX; py++) {
    for (let px = 0; px < BODY_PX; px++) {
      if (!mask[py][px]) continue;
      setPixel(rgba, SHEET_W, offsetX + px, py, 255, 255, 255, 255);
    }
  }
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, writePngRgba(SHEET_W, SHEET_H, rgba));
console.log(`Wrote ${OUT_PATH} (${SHEET_W}x${SHEET_H})`);
