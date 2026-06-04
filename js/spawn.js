/**
 * Spawn do jogador — última posição salva ou ao lado do poço central.
 */

import { CONFIG } from './config.js';
import { collidesAt, getPlayerBounds } from './canvas/collision.js?v=canvas18';

const LOCAL_POSITION_KEY = 'insocialidade_last_position';

function inMapBounds(map, x, y) {
  const b = getPlayerBounds(x, y);
  return (
    b.left >= 0 &&
    b.top >= 0 &&
    b.right <= map.pixelWidth &&
    b.bottom <= map.pixelHeight
  );
}

function isValidSpawn(map, x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && inMapBounds(map, x, y) && !collidesAt(map, x, y);
}

function readLocalPosition(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(LOCAL_POSITION_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[userId] || null;
  } catch {
    return null;
  }
}

export function saveLocalPosition(userId, { map, x, y, facing }) {
  if (!userId || !Number.isFinite(x) || !Number.isFinite(y)) return;
  try {
    const raw = localStorage.getItem(LOCAL_POSITION_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = {
      map,
      x: Math.round(x),
      y: Math.round(y),
      facing: facing || 'down',
    };
    localStorage.setItem(LOCAL_POSITION_KEY, JSON.stringify(all));
  } catch {
    // ignora quota / modo privado
  }
}

function pickSavedPosition(profile, userId, mapId) {
  const fromProfile = profile?.saved_position;
  if (fromProfile?.map === mapId && Number.isFinite(fromProfile.x) && Number.isFinite(fromProfile.y)) {
    return fromProfile;
  }

  const local = readLocalPosition(userId);
  if (local?.map === mapId && Number.isFinite(local.x) && Number.isFinite(local.y)) {
    return local;
  }

  return null;
}

/**
 * Retorna posição inicial: última posição no mesmo mapa, ou ao lado do poço central.
 */
export function resolvePlayerSpawn(map, mapId, profile, userId) {
  const saved = pickSavedPosition(profile, userId, mapId);

  if (saved && isValidSpawn(map, saved.x, saved.y)) {
    return {
      x: saved.x,
      y: saved.y,
      facing: saved.facing || 'down',
    };
  }

  const spawn = map.defaultSpawn || map.spawn;
  return {
    x: spawn.x,
    y: spawn.y,
    facing: 'down',
  };
}

export function getCurrentMapId(mapUrl = CONFIG.MAP_URL) {
  try {
    const gameBase = new URL('game.html', window.location.href);
    return new URL(mapUrl.replace(/^\//, ''), gameBase).pathname;
  } catch {
    return mapUrl;
  }
}
