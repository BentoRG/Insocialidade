/**
 * Minigame Jogo da Cobrinha — overlay no canvas principal.
 */

import { saveSnakeBestScore } from '../snake-best-score.js';
import { saveSnakeUnlockedPhase, SNAKE_MAX_PHASE } from '../snake-progress.js';

const PHASES = [
  { id: 1, gridSize: 6 },
  { id: 2, gridSize: 12 },
  { id: 3, gridSize: 18 },
];

const MOVE_INTERVAL_MS = 155;
const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const PANEL_BG = '#141414';
const GRID_LINE = 'rgba(248, 243, 230, 0.08)';
const GRID_LINE_STRONG = 'rgba(248, 243, 230, 0.16)';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const TEXT_COLOR = '#f8f3e6';
const MUTED_COLOR = '#e6d3a3';
const SNAKE_COLOR = '#4caf50';
const SNAKE_HEAD = '#81c784';
const FOOD_COLOR = '#e53935';
const GAMEOVER_PANEL_BG = 'rgba(0, 0, 0, 0.78)';
const LOCKED_COLOR = 'rgba(248, 243, 230, 0.35)';

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function getPhaseConfig(phaseId) {
  return PHASES.find((phase) => phase.id === phaseId) || PHASES[0];
}

function smoothstep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function cloneSnake(snake) {
  return snake.map((segment) => ({ x: segment.x, y: segment.y }));
}

function directionFromInput(input) {
  const { dx, dy } = input.getDirection();
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

function isOpposite(a, b) {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}

function randomEmptyCell(snake, gridSize) {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const free = [];

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }

  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function createInitialState(phaseId) {
  const { gridSize } = getPhaseConfig(phaseId);
  const startX = Math.floor(gridSize / 2);
  const startY = Math.floor(gridSize / 2);
  const snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  return {
    status: 'waiting',
    phaseId,
    gridSize,
    snake,
    fromSnake: cloneSnake(snake),
    direction: 'right',
    queuedDirection: 'right',
    food: randomEmptyCell(snake, gridSize),
    score: 0,
    moveTimer: 0,
  };
}

function drawGrid(ctx, boardX, boardY, cellSize, gridSize) {
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;

  for (let col = 0; col <= gridSize; col++) {
    const x = boardX + col * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, boardY + 0.5);
    ctx.lineTo(x, boardY + gridSize * cellSize + 0.5);
    ctx.stroke();
  }

  for (let row = 0; row <= gridSize; row++) {
    const y = boardY + row * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(boardX + 0.5, y);
    ctx.lineTo(boardX + gridSize * cellSize + 0.5, y);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_LINE_STRONG;
  ctx.strokeRect(boardX + 0.5, boardY + 0.5, gridSize * cellSize, gridSize * cellSize);
}

function lerpSegment(from, to, t) {
  if (!from) return to;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function drawGameOverScreen(ctx, boardX, boardY, boardW, boardH) {
  ctx.fillStyle = GAMEOVER_PANEL_BG;
  ctx.fillRect(boardX, boardY, boardW, boardH);
}

function drawPhaseSelector(ctx, screenW, y, currentPhaseId, unlockedPhase) {
  const buttonW = 52;
  const buttonH = 28;
  const gap = 10;
  const totalW = PHASES.length * buttonW + (PHASES.length - 1) * gap;
  let x = Math.round((screenW - totalW) / 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '11px ui-monospace, monospace';

  for (const phase of PHASES) {
    const locked = phase.id > unlockedPhase;
    const selected = phase.id === currentPhaseId;

    ctx.fillStyle = locked ? 'rgba(20, 20, 20, 0.9)' : selected ? TEXT_COLOR : PANEL_BG;
    ctx.fillRect(x, y, buttonW, buttonH);
    ctx.strokeStyle = locked ? LOCKED_COLOR : selected ? TEXT_COLOR : PANEL_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, buttonW - 1, buttonH - 1);

    ctx.fillStyle = locked ? LOCKED_COLOR : selected ? '#141414' : TEXT_COLOR;
    const label = locked ? `${phase.id} 🔒` : String(phase.id);
    ctx.fillText(label, x + buttonW / 2, y + buttonH / 2);

    x += buttonW + gap;
  }

  ctx.fillStyle = MUTED_COLOR;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText('Teclas 1, 2 ou 3 para escolher a fase', screenW / 2, y + buttonH + 8);
}

export function createSnakeMinigame({
  userId,
  token,
  initialBestScore = 0,
  initialUnlockedPhase = 1,
  onClose,
  onProgressChange,
} = {}) {
  let unlockedPhase = Math.max(1, Math.min(SNAKE_MAX_PHASE, initialUnlockedPhase));
  let state = createInitialState(1);
  let bestScore = initialBestScore;

  function resetGame(phaseId = state.phaseId) {
    state = createInitialState(phaseId);
  }

  function unlockPhase(phaseId) {
    if (phaseId <= unlockedPhase) return unlockedPhase;
    unlockedPhase = saveSnakeUnlockedPhase(userId, phaseId);
    onProgressChange?.(unlockedPhase);
    return unlockedPhase;
  }

  function handleGameOver() {
    if (state.status === 'gameover') return;
    state.status = 'gameover';
    bestScore = Math.max(bestScore, state.score);
    void saveSnakeBestScore(userId, token, state.score).then((next) => {
      bestScore = next;
    });
  }

  function handlePhaseComplete() {
    if (state.status === 'phase_complete') return;
    state.status = 'phase_complete';
    state.food = null;
    bestScore = Math.max(bestScore, state.score);
    void saveSnakeBestScore(userId, token, state.score).then((next) => {
      bestScore = next;
    });
    if (state.phaseId < SNAKE_MAX_PHASE) {
      unlockPhase(state.phaseId + 1);
    }
  }

  function isGridFull() {
    return state.snake.length >= state.gridSize * state.gridSize;
  }

  function stepSnake() {
    state.direction = state.queuedDirection;
    const head = state.snake[0];
    const delta = DIRECTIONS[state.direction];
    const next = { x: head.x + delta.x, y: head.y + delta.y };

    if (
      next.x < 0 ||
      next.x >= state.gridSize ||
      next.y < 0 ||
      next.y >= state.gridSize ||
      state.snake.some((segment) => segment.x === next.x && segment.y === next.y)
    ) {
      handleGameOver();
      return;
    }

    state.snake.unshift(next);

    if (state.food && next.x === state.food.x && next.y === state.food.y) {
      state.score += 1;
      if (state.score > bestScore) bestScore = state.score;

      if (isGridFull()) {
        handlePhaseComplete();
        return;
      }

      state.food = randomEmptyCell(state.snake, state.gridSize);
      if (!state.food) handlePhaseComplete();
    } else {
      state.snake.pop();
    }
  }

  function beginPlaying(nextDir) {
    if (state.status !== 'waiting') return;
    state.status = 'playing';
    state.queuedDirection = nextDir;
    state.direction = nextDir;
    state.fromSnake = cloneSnake(state.snake);
    state.moveTimer = 0;
  }

  function selectPhase(phaseId) {
    if (phaseId < 1 || phaseId > SNAKE_MAX_PHASE || phaseId > unlockedPhase) return false;
    if (state.status !== 'waiting' && state.status !== 'phase_complete') return false;
    resetGame(phaseId);
    return true;
  }

  function phaseFromInput(input) {
    if (!input.consumeDigit) return null;
    for (let phaseId = 1; phaseId <= SNAKE_MAX_PHASE; phaseId++) {
      if (input.consumeDigit(phaseId)) return phaseId;
    }
    return null;
  }

  return {
    getStatus() {
      return state.status;
    },

    getScore() {
      return state.score;
    },

    getBestScore() {
      return bestScore;
    },

    getPhaseId() {
      return state.phaseId;
    },

    getGridSize() {
      return state.gridSize;
    },

    getUnlockedPhase() {
      return unlockedPhase;
    },

    hasNextPhase() {
      return state.phaseId < SNAKE_MAX_PHASE && state.phaseId < unlockedPhase;
    },

    restart() {
      resetGame(state.phaseId);
    },

    startNextPhase() {
      const nextPhase = state.phaseId + 1;
      if (nextPhase > unlockedPhase || nextPhase > SNAKE_MAX_PHASE) return false;
      resetGame(nextPhase);
      return true;
    },

    update(dt, input) {
      const requestedPhase = phaseFromInput(input);
      if (requestedPhase) {
        selectPhase(requestedPhase);
      }

      const nextDir = directionFromInput(input);

      if (state.status === 'waiting') {
        if (nextDir) {
          beginPlaying(nextDir);
        }
        return;
      }

      if (state.status === 'gameover' || state.status === 'phase_complete') {
        return;
      }

      if (nextDir && !isOpposite(nextDir, state.direction)) {
        state.queuedDirection = nextDir;
      }

      state.moveTimer += dt * 1000;
      if (state.moveTimer < MOVE_INTERVAL_MS) return;

      state.moveTimer -= MOVE_INTERVAL_MS;
      state.fromSnake = cloneSnake(state.snake);
      stepSnake();
    },

    draw(ctx, screenW, screenH) {
      const { gridSize } = state;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      const margin = 16;
      const headerH = 96;
      const footerH = 28;
      const maxBoardW = screenW - margin * 2;
      const maxBoardH = screenH - margin * 2 - headerH - footerH;
      const cellSize = Math.max(
        8,
        Math.floor(Math.min(maxBoardW / gridSize, maxBoardH / gridSize))
      );
      const boardW = cellSize * gridSize;
      const boardH = cellSize * gridSize;
      const boardX = Math.round((screenW - boardW) / 2);
      const boardY = Math.round(margin + headerH);
      const inset = Math.max(1, Math.floor(cellSize * 0.1));
      const animT =
        state.status === 'playing'
          ? smoothstep(state.moveTimer / MOVE_INTERVAL_MS)
          : 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillText('JOGO DA COBRINHA', screenW / 2, margin);

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(
        `Fase ${state.phaseId} · ${gridSize}×${gridSize}`,
        screenW / 2,
        margin + 18
      );

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('PONTOS', screenW / 2, margin + 36);

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.fillText(String(state.score), screenW / 2, margin + 50);

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(`Seu recorde: ${bestScore}`, screenW / 2, margin + 80);

      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(boardX - 2, boardY - 2, boardW + 4, boardH + 4);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(boardX - 2.5, boardY - 2.5, boardW + 5, boardH + 5);

      drawGrid(ctx, boardX, boardY, cellSize, gridSize);

      for (let i = state.snake.length - 1; i >= 0; i--) {
        const from = state.fromSnake[i] || state.snake[i];
        const to = state.snake[i];
        const pos = lerpSegment(from, to, animT);
        ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE_COLOR;
        ctx.fillRect(
          boardX + pos.x * cellSize + inset,
          boardY + pos.y * cellSize + inset,
          cellSize - inset * 2,
          cellSize - inset * 2
        );
      }

      if (state.food) {
        ctx.fillStyle = FOOD_COLOR;
        ctx.fillRect(
          boardX + state.food.x * cellSize + inset,
          boardY + state.food.y * cellSize + inset,
          cellSize - inset * 2,
          cellSize - inset * 2
        );
      }

      if (state.status === 'waiting') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(boardX, boardY, boardW, boardH);
        drawPhaseSelector(ctx, screenW, boardY + boardH / 2 - 36, state.phaseId, unlockedPhase);
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Pressione uma seta', screenW / 2, boardY + boardH / 2 + 28);
        ctx.fillText('para começar', screenW / 2, boardY + boardH / 2 + 46);
      }

      if (state.status === 'gameover') {
        drawGameOverScreen(ctx, boardX, boardY, boardW, boardH);
      }

      if (state.status === 'phase_complete') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        ctx.fillRect(boardX, boardY, boardW, boardH);
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Grade completa!', screenW / 2, boardY + boardH / 2 - 10);
        if (state.phaseId < SNAKE_MAX_PHASE) {
          ctx.fillStyle = MUTED_COLOR;
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText('Próxima fase desbloqueada', screenW / 2, boardY + boardH / 2 + 12);
        } else {
          ctx.fillStyle = MUTED_COLOR;
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText('Todas as fases concluídas!', screenW / 2, boardY + boardH / 2 + 12);
        }
      }

      if (state.status === 'playing') {
        const footerY = boardY + boardH + 10;
        ctx.fillStyle = MUTED_COLOR;
        ctx.font = '11px ui-monospace, monospace';
        ctx.textBaseline = 'top';
        ctx.fillText('WASD ou setas para mover', screenW / 2, footerY);
      }

      ctx.restore();
    },

    destroy() {
      onClose?.();
    },
  };
}
