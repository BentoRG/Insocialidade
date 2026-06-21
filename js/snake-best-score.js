/**
 * Recorde do Jogo da Cobrinha por fase e conta — servidor + cache local.
 */

import { apiSaveSnakeBestScore, getStoredSession, saveSession } from './api.js';
import { SNAKE_MAX_PHASE } from './snake-progress.js';

const SNAKE_BEST_KEY = 'insocialidade_snake_best';

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? Math.floor(score) : 0;
}

function normalizePhaseId(phaseId) {
  const phase = Number(phaseId);
  if (!Number.isFinite(phase)) return 1;
  return Math.max(1, Math.min(SNAKE_MAX_PHASE, Math.floor(phase)));
}

export function emptySnakeBestScores() {
  const scores = {};
  for (let phase = 1; phase <= SNAKE_MAX_PHASE; phase++) {
    scores[phase] = 0;
  }
  return scores;
}

function normalizePhaseScores(value) {
  const scores = emptySnakeBestScores();
  if (value == null) return scores;

  if (typeof value === 'number') {
    scores[1] = normalizeScore(value);
    return scores;
  }

  if (typeof value !== 'object') return scores;

  for (let phase = 1; phase <= SNAKE_MAX_PHASE; phase++) {
    scores[phase] = normalizeScore(value[phase] ?? value[String(phase)]);
  }

  return scores;
}

function mergePhaseScores(...sources) {
  const merged = emptySnakeBestScores();
  for (const source of sources) {
    const scores = normalizePhaseScores(source);
    for (let phase = 1; phase <= SNAKE_MAX_PHASE; phase++) {
      merged[phase] = Math.max(merged[phase], scores[phase]);
    }
  }
  return merged;
}

function readStoredUserScores(raw) {
  if (typeof raw === 'number') {
    return normalizePhaseScores(raw);
  }
  return normalizePhaseScores(raw);
}

function getLocalSnakeBestScores(userId) {
  if (!userId) return emptySnakeBestScores();

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    if (!raw) return emptySnakeBestScores();
    const all = JSON.parse(raw);
    return readStoredUserScores(all[userId]);
  } catch {
    return emptySnakeBestScores();
  }
}

function setLocalSnakeBestScores(userId, scores) {
  if (!userId) return;

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = normalizePhaseScores(scores);
    localStorage.setItem(SNAKE_BEST_KEY, JSON.stringify(all));
  } catch {
    // ignora quota / modo privado
  }
}

function updateStoredProfileScores(scores) {
  const stored = getStoredSession();
  if (!stored?.profile) return;

  const normalized = normalizePhaseScores(scores);
  const globalBest = Math.max(...Object.values(normalized));
  saveSession(stored.token, {
    ...stored.profile,
    snake_best_score: globalBest,
    snake_best_scores: normalized,
  });
}

export function getSnakeBestScoreForPhase(userId, phaseId) {
  return getLocalSnakeBestScores(userId)[normalizePhaseId(phaseId)] ?? 0;
}

export function getSnakeBestScore(userId) {
  const scores = getLocalSnakeBestScores(userId);
  return Math.max(...Object.values(scores));
}

export async function loadSnakeBestScores(userId, token, profileScores = null) {
  const local = getLocalSnakeBestScores(userId);
  const fromServer = normalizePhaseScores(profileScores);
  let best = mergePhaseScores(local, fromServer);

  if (token && JSON.stringify(best) !== JSON.stringify(fromServer)) {
    for (let phase = 1; phase <= SNAKE_MAX_PHASE; phase++) {
      if (best[phase] <= fromServer[phase]) continue;
      try {
        const data = await apiSaveSnakeBestScore(token, phase, best[phase]);
        best = mergePhaseScores(best, data.snake_best_scores ?? fromServer);
      } catch {
        break;
      }
    }
  }

  setLocalSnakeBestScores(userId, best);
  updateStoredProfileScores(best);
  return best;
}

export async function saveSnakeBestScore(userId, token, phaseId, score) {
  const phase = normalizePhaseId(phaseId);
  if (!userId || !Number.isFinite(score) || score < 0) {
    return getLocalSnakeBestScores(userId)[phase];
  }

  const current = getLocalSnakeBestScores(userId);
  const next = {
    ...current,
    [phase]: Math.max(current[phase] ?? 0, normalizeScore(score)),
  };
  setLocalSnakeBestScores(userId, next);

  if (token) {
    try {
      const data = await apiSaveSnakeBestScore(token, phase, next[phase]);
      const best = mergePhaseScores(next, data.snake_best_scores);
      setLocalSnakeBestScores(userId, best);
      updateStoredProfileScores(best);
      return best[phase];
    } catch {
      // fallback para cache local
    }
  }

  return next[phase];
}
