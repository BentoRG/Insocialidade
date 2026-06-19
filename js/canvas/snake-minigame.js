/**
 * Minigame Jogo da Cobrinha — overlay no canvas principal.
 */

const GRID_SIZE = 15;
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

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

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

function randomEmptyCell(snake) {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const free = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }

  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function createInitialState() {
  const startX = Math.floor(GRID_SIZE / 2);
  const startY = Math.floor(GRID_SIZE / 2);
  const snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  return {
    status: 'waiting',
    snake,
    fromSnake: cloneSnake(snake),
    direction: 'right',
    queuedDirection: 'right',
    food: randomEmptyCell(snake),
    score: 0,
    moveTimer: 0,
  };
}

function drawGrid(ctx, boardX, boardY, cellSize) {
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;

  for (let col = 0; col <= GRID_SIZE; col++) {
    const x = boardX + col * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, boardY + 0.5);
    ctx.lineTo(x, boardY + GRID_SIZE * cellSize + 0.5);
    ctx.stroke();
  }

  for (let row = 0; row <= GRID_SIZE; row++) {
    const y = boardY + row * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(boardX + 0.5, y);
    ctx.lineTo(boardX + GRID_SIZE * cellSize + 0.5, y);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_LINE_STRONG;
  ctx.strokeRect(boardX + 0.5, boardY + 0.5, GRID_SIZE * cellSize, GRID_SIZE * cellSize);
}

function lerpSegment(from, to, t) {
  if (!from) return to;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

function drawGameOverScreen(ctx, screenW, boardX, boardY, boardW, boardH, score) {
  ctx.fillStyle = GAMEOVER_PANEL_BG;
  ctx.fillRect(boardX, boardY, boardW, boardH);

  const centerX = screenW / 2;
  const centerY = boardY + boardH / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.fillText('FIM DE JOGO', centerX, centerY - 42);

  ctx.fillStyle = MUTED_COLOR;
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText('PONTOS', centerX, centerY - 8);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 36px ui-monospace, monospace';
  ctx.fillText(String(score), centerX, centerY + 28);
}

export function createSnakeMinigame({ onClose } = {}) {
  let state = createInitialState();

  function resetGame() {
    state = createInitialState();
  }

  function stepSnake() {
    state.direction = state.queuedDirection;
    const head = state.snake[0];
    const delta = DIRECTIONS[state.direction];
    const next = { x: head.x + delta.x, y: head.y + delta.y };

    if (
      next.x < 0 ||
      next.x >= GRID_SIZE ||
      next.y < 0 ||
      next.y >= GRID_SIZE ||
      state.snake.some((segment) => segment.x === next.x && segment.y === next.y)
    ) {
      state.status = 'gameover';
      return;
    }

    state.snake.unshift(next);

    if (state.food && next.x === state.food.x && next.y === state.food.y) {
      state.score += 1;
      state.food = randomEmptyCell(state.snake);
      if (!state.food) state.status = 'gameover';
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

  return {
    getStatus() {
      return state.status;
    },

    getScore() {
      return state.score;
    },

    restart() {
      resetGame();
    },

    update(dt, input) {
      const nextDir = directionFromInput(input);

      if (state.status === 'waiting') {
        if (nextDir) {
          beginPlaying(nextDir);
        }
        return;
      }

      if (state.status === 'gameover') {
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
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      const margin = 16;
      const headerH = 64;
      const footerH = 28;
      const maxBoardW = screenW - margin * 2;
      const maxBoardH = screenH - margin * 2 - headerH - footerH;
      const cellSize = Math.max(
        10,
        Math.floor(Math.min(maxBoardW / GRID_SIZE, maxBoardH / GRID_SIZE))
      );
      const boardW = cellSize * GRID_SIZE;
      const boardH = cellSize * GRID_SIZE;
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
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('PONTOS', screenW / 2, margin + 20);

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 28px ui-monospace, monospace';
      ctx.fillText(String(state.score), screenW / 2, margin + 34);

      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(boardX - 2, boardY - 2, boardW + 4, boardH + 4);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(boardX - 2.5, boardY - 2.5, boardW + 5, boardH + 5);

      drawGrid(ctx, boardX, boardY, cellSize);

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
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '12px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Pressione uma seta', screenW / 2, boardY + boardH / 2 - 8);
        ctx.fillText('para começar', screenW / 2, boardY + boardH / 2 + 10);
      }

      if (state.status === 'gameover') {
        drawGameOverScreen(ctx, screenW, boardX, boardY, boardW, boardH, state.score);
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
