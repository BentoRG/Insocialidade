/**
 * Progressão de fases do Jogo da Cobrinha — cache local por conta.
 */

const SNAKE_PROGRESS_KEY = 'insocialidade_snake_progress';
export const SNAKE_MAX_PHASE = 3;

const SNAKE_PHASE_GRID_SIZES = { 1: 6, 2: 10, 3: 14 };

function normalizePhase(value) {
  const phase = Number(value);
  if (!Number.isFinite(phase)) return 1;
  return Math.max(1, Math.min(SNAKE_MAX_PHASE, Math.floor(phase)));
}

export function getSnakePhaseMaxScore(phaseId) {
  const gridSize = SNAKE_PHASE_GRID_SIZES[normalizePhase(phaseId)] || 6;
  return gridSize * gridSize - 3;
}

export function getSnakeUnlockedPhase(userId) {
  if (!userId) return 1;

  try {
    const raw = localStorage.getItem(SNAKE_PROGRESS_KEY);
    if (!raw) return 1;
    const all = JSON.parse(raw);
    return normalizePhase(all[userId]);
  } catch {
    return 1;
  }
}

export function saveSnakeUnlockedPhase(userId, phase) {
  if (!userId) return 1;

  const next = normalizePhase(phase);

  try {
    const raw = localStorage.getItem(SNAKE_PROGRESS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = Math.max(normalizePhase(all[userId]), next);
    localStorage.setItem(SNAKE_PROGRESS_KEY, JSON.stringify(all));
    return all[userId];
  } catch {
    return next;
  }
}

export function loadSnakeProgress(userId) {
  return getSnakeUnlockedPhase(userId);
}
