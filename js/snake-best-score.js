/**
 * Recorde do Jogo da Cobrinha por fase e conta — servidor + cache local.
 */

import { apiSaveSnakeBestScore, getStoredSession, saveSession } from './api.js';
import { SNAKE_MAX_PHASE, getSnakePhaseMaxScore } from './snake-progress.js';
import { getSnakeSkinUnlockId } from './skins.js?v=skins3';
import { applyUnlockedSkins, loadSkinState } from './skin-store.js?v=skinstore3';

const SNAKE_BEST_KEY = 'insocialidade_snake_best_phases_v2';
const LEGACY_SNAKE_BEST_KEYS = [
  'insocialidade_snake_best',
  'insocialidade_snake_best_phases',
];

let legacySnakeBestScoresCleared = false;

function discardLegacySnakeBestScores() {
  if (legacySnakeBestScoresCleared) return;
  legacySnakeBestScoresCleared = true;

  for (const key of LEGACY_SNAKE_BEST_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignora quota / modo privado
    }
  }
}

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
  discardLegacySnakeBestScores();
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

function unlockSkinsFromSnakeScores(userId, scores, profile = {}) {
  const current = loadSkinState(userId, profile);
  const extra = [];

  for (let phase = 1; phase <= SNAKE_MAX_PHASE; phase++) {
    const skinId = getSnakeSkinUnlockId(phase);
    if (!skinId) continue;
    if ((scores[phase] ?? 0) >= getSnakePhaseMaxScore(phase) && !current.unlockedSkins.includes(skinId)) {
      extra.push(skinId);
    }
  }

  if (!extra.length) {
    return { unlockedSkins: current.unlockedSkins, newlyUnlockedSkins: [] };
  }

  return applyUnlockedSkins(userId, [...current.unlockedSkins, ...extra], profile);
}

function buildSaveResult(userId, phase, score, unlockResult) {
  return {
    score,
    unlockedSkins: unlockResult.unlockedSkins,
    newlyUnlockedSkins: unlockResult.newlyUnlockedSkins,
  };
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

  let unlockResult = unlockSkinsFromSnakeScores(userId, best);
  if (token) {
    try {
      const data = await apiSaveSnakeBestScore(token, 1, best[1]);
      best = mergePhaseScores(best, data.snake_best_scores);
      setLocalSnakeBestScores(userId, best);
      updateStoredProfileScores(best);
      if (Array.isArray(data.unlocked_skins)) {
        unlockResult = applyUnlockedSkins(userId, data.unlocked_skins);
      } else {
        unlockResult = unlockSkinsFromSnakeScores(userId, best);
      }
    } catch {
      // fallback para cache local
    }
  }

  return { scores: best, ...unlockResult };
}

export async function saveSnakeBestScore(userId, token, phaseId, score) {
  const phase = normalizePhaseId(phaseId);
  if (!userId || !Number.isFinite(score) || score < 0) {
    const current = getLocalSnakeBestScores(userId);
    return buildSaveResult(userId, phase, current[phase], {
      unlockedSkins: loadSkinState(userId).unlockedSkins,
      newlyUnlockedSkins: [],
    });
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
      const unlockResult = Array.isArray(data.unlocked_skins)
        ? applyUnlockedSkins(userId, data.unlocked_skins)
        : unlockSkinsFromSnakeScores(userId, best);
      return buildSaveResult(userId, phase, best[phase], unlockResult);
    } catch {
      // fallback para cache local
    }
  }

  const unlockResult = unlockSkinsFromSnakeScores(userId, next);
  return buildSaveResult(userId, phase, next[phase], unlockResult);
}
