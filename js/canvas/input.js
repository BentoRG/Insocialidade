/**
 * Teclado — WASD + setas, diagonal normalizada.
 */

const KEY_MAP = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export function createInput() {
  const pressed = new Set();

  function onKeyDown(e) {
    if (KEY_MAP[e.code]) {
      e.preventDefault();
      pressed.add(e.code);
    }
  }

  function onKeyUp(e) {
    pressed.delete(e.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return {
    getDirection() {
      let dx = 0;
      let dy = 0;

      for (const code of pressed) {
        const [kx, ky] = KEY_MAP[code] || [0, 0];
        dx += kx;
        dy += ky;
      }

      if (dx === 0 && dy === 0) return { dx: 0, dy: 0, moving: false };

      const len = Math.hypot(dx, dy);
      return { dx: dx / len, dy: dy / len, moving: true };
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      pressed.clear();
    },

    clear() {
      pressed.clear();
    },
  };
}
