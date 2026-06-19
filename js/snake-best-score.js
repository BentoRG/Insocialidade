/**
 * Recorde local do Jogo da Cobrinha por conta.
 */

const SNAKE_BEST_KEY = 'insocialidade_snake_best';

export function getSnakeBestScore(userId) {
  if (!userId) return 0;

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    if (!raw) return 0;
    const all = JSON.parse(raw);
    const score = Number(all[userId]);
    return Number.isFinite(score) && score >= 0 ? score : 0;
  } catch {
    return 0;
  }
}

export function saveSnakeBestScore(userId, score) {
  if (!userId || !Number.isFinite(score) || score < 0) {
    return getSnakeBestScore(userId);
  }

  const next = Math.max(getSnakeBestScore(userId), score);

  try {
    const raw = localStorage.getItem(SNAKE_BEST_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = next;
    localStorage.setItem(SNAKE_BEST_KEY, JSON.stringify(all));
  } catch {
    // ignora quota / modo privado
  }

  return next;
}
