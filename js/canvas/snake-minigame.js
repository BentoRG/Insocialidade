/**
 * Minigame Jogo da Cobrinha — overlay no canvas principal.
 */

const MOVE_INTERVAL_MS = 140;
const GRID_COLS = 20;
const GRID_ROWS = 15;
const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const PANEL_BG = '#1a1a1a';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const TEXT_COLOR = '#f8f3e6';
const MUTED_COLOR = '#e6d3a3';
const SNAKE_COLOR = '#4caf50';
const SNAKE_HEAD = '#81c784';
const FOOD_COLOR = '#e53935';

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

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

  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }

  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function createInitialState() {
  const startX = Math.floor(GRID_COLS / 2);
  const startY = Math.floor(GRID_ROWS / 2);
  const snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  return {
    snake,
    direction: 'right',
    queuedDirection: 'right',
    food: randomEmptyCell(snake),
    score: 0,
    gameOver: false,
    moveTimer: 0,
  };
}

export function createSnakeMinigame({ onClose } = {}) {
  let state = createInitialState();
  let restartRequested = false;

  function resetGame() {
    state = createInitialState();
    restartRequested = false;
  }

  function stepSnake() {
    if (state.gameOver) return;

    state.direction = state.queuedDirection;
    const head = state.snake[0];
    const delta = DIRECTIONS[state.direction];
    const next = { x: head.x + delta.x, y: head.y + delta.y };

    if (
      next.x < 0 ||
      next.x >= GRID_COLS ||
      next.y < 0 ||
      next.y >= GRID_ROWS ||
      state.snake.some((segment) => segment.x === next.x && segment.y === next.y)
    ) {
      state.gameOver = true;
      return;
    }

    state.snake.unshift(next);

    if (state.food && next.x === state.food.x && next.y === state.food.y) {
      state.score += 1;
      state.food = randomEmptyCell(state.snake);
      if (!state.food) state.gameOver = true;
    } else {
      state.snake.pop();
    }
  }

  return {
    update(dt, input) {
      const nextDir = directionFromInput(input);
      if (nextDir && !isOpposite(nextDir, state.direction)) {
        state.queuedDirection = nextDir;
      }

      if (state.gameOver) {
        if (restartRequested) {
          resetGame();
        }
        return;
      }

      state.moveTimer += dt * 1000;
      while (state.moveTimer >= MOVE_INTERVAL_MS) {
        state.moveTimer -= MOVE_INTERVAL_MS;
        stepSnake();
        if (state.gameOver) break;
      }
    },

    draw(ctx, screenW, screenH) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      const margin = 16;
      const headerH = 52;
      const footerH = 28;
      const maxBoardW = screenW - margin * 2;
      const maxBoardH = screenH - margin * 2 - headerH - footerH;
      const cellSize = Math.max(
        8,
        Math.floor(Math.min(maxBoardW / GRID_COLS, maxBoardH / GRID_ROWS))
      );
      const boardW = cellSize * GRID_COLS;
      const boardH = cellSize * GRID_ROWS;
      const boardX = Math.round((screenW - boardW) / 2);
      const boardY = Math.round(margin + headerH);

      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = TEXT_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('JOGO DA COBRINHA', screenW / 2, margin);
      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(`Pontos: ${state.score}`, screenW / 2, margin + 22);

      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(boardX - 2, boardY - 2, boardW + 4, boardH + 4);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(boardX - 2.5, boardY - 2.5, boardW + 5, boardH + 5);

      for (let i = 0; i < state.snake.length; i++) {
        const segment = state.snake[i];
        ctx.fillStyle = i === 0 ? SNAKE_HEAD : SNAKE_COLOR;
        ctx.fillRect(
          boardX + segment.x * cellSize,
          boardY + segment.y * cellSize,
          cellSize,
          cellSize
        );
      }

      if (state.food) {
        ctx.fillStyle = FOOD_COLOR;
        ctx.fillRect(
          boardX + state.food.x * cellSize,
          boardY + state.food.y * cellSize,
          cellSize,
          cellSize
        );
      }

      const footerY = boardY + boardH + 10;
      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      if (state.gameOver) {
        ctx.fillText('Fim de jogo — Enter ou clique para reiniciar', screenW / 2, footerY);
      } else {
        ctx.fillText('WASD ou setas para mover', screenW / 2, footerY);
      }
      ctx.fillText('Fechar (Esc)', screenW / 2, footerY + 14);

      ctx.restore();

      return {
        boardX,
        boardY,
        boardW,
        boardH,
        footerY,
        gameOver: state.gameOver,
      };
    },

    requestRestart() {
      if (state.gameOver) {
        restartRequested = true;
      }
    },

    destroy() {
      onClose?.();
    },
  };
}
