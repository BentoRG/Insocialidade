/**
 * Progressão de fases do Jogo da Cobrinha — cache local por conta.
 */

const SNAKE_PROGRESS_KEY = 'insocialidade_snake_progress';
export const SNAKE_MAX_PHASE = 3;

function normalizePhase(value) {
  const phase = Number(value);
  if (!Number.isFinite(phase)) return 1;
  return Math.max(1, Math.min(SNAKE_MAX_PHASE, Math.floor(phase)));
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
