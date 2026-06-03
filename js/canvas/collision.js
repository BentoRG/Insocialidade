/**
 * Colisão AABB do player vs tiles sólidos.
 */

const PLAYER_W = 10;
const PLAYER_H = 12;

export function getPlayerBounds(x, y) {
  return {
    left: x - PLAYER_W / 2,
    right: x + PLAYER_W / 2,
    top: y - PLAYER_H + 2,
    bottom: y,
    width: PLAYER_W,
    height: PLAYER_H,
  };
}

export function isSolidAt(map, px, py) {
  const col = Math.floor(px / map.tileWidth);
  const row = Math.floor(py / map.tileHeight);

  if (col < 0 || row < 0 || col >= map.width || row >= map.height) {
    return true;
  }

  return map.isSolid(col, row);
}

export function collidesAt(map, x, y) {
  const b = getPlayerBounds(x, y);
  const points = [
    [b.left, b.top],
    [b.right - 0.01, b.top],
    [b.left, b.bottom - 0.01],
    [b.right - 0.01, b.bottom - 0.01],
  ];

  return points.some(([px, py]) => isSolidAt(map, px, py));
}

export function moveWithCollision(map, x, y, dx, dy) {
  let nx = x + dx;
  if (!collidesAt(map, nx, y)) {
    x = nx;
  }

  let ny = y + dy;
  if (!collidesAt(map, x, ny)) {
    y = ny;
  }

  return { x, y };
}
