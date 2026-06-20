/**
 * Recorde do Jogo da Cobrinha por conta — servidor + cache local.
 */

import { apiSaveSnakeBestScore, getStoredSession, saveSession } from './api.js';

const SNAKE_BEST_KEY = 'insocialidade_snake_best';

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? Math.floor(score) : 0;
}

function getLocalSnakeBestScore(userId) {
  if (!userId) return 0;

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    if (!raw) return 0;
    const all = JSON.parse(raw);
    return normalizeScore(all[userId]);
  } catch {
    return 0;
  }
}

function setLocalSnakeBestScore(userId, score) {
  if (!userId) return;

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = normalizeScore(score);
    localStorage.setItem(SNAKE_BEST_KEY, JSON.stringify(all));
  } catch {
    // ignora quota / modo privado
  }
}

function updateStoredProfileScore(score) {
  const stored = getStoredSession();
  if (!stored?.profile) return;
  saveSession(stored.token, { ...stored.profile, snake_best_score: score });
}

export function getSnakeBestScore(userId) {
  return getLocalSnakeBestScore(userId);
}

export async function loadSnakeBestScore(userId, token, profileScore = 0) {
  const local = getLocalSnakeBestScore(userId);
  const fromServer = normalizeScore(profileScore);
  let best = Math.max(local, fromServer);

  if (token && best > fromServer) {
    try {
      const data = await apiSaveSnakeBestScore(token, best);
      best = normalizeScore(data.snake_best_score ?? best);
    } catch {
      // mantém o melhor valor local conhecido
    }
  }

  setLocalSnakeBestScore(userId, best);
  updateStoredProfileScore(best);
  return best;
}

export async function saveSnakeBestScore(userId, token, score) {
  if (!userId || !Number.isFinite(score) || score < 0) {
    return getLocalSnakeBestScore(userId);
  }

  const next = Math.max(getLocalSnakeBestScore(userId), normalizeScore(score));
  setLocalSnakeBestScore(userId, next);

  if (token) {
    try {
      const data = await apiSaveSnakeBestScore(token, next);
      const best = normalizeScore(data.snake_best_score ?? next);
      setLocalSnakeBestScore(userId, best);
      updateStoredProfileScore(best);
      return best;
    } catch {
      // fallback para cache local
    }
  }

  return next;
}
