/**
 * Minimapa — pré-render do terreno + retângulo da viewport.
 */

const PADDING = 8;
const HEIGHT_FRACTION = 0.2;
const PANEL_BG = 'rgba(0, 0, 0, 0.55)';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const VIEWPORT_STROKE = 'rgba(255, 255, 255, 0.9)';

function bakeMapSurface(map) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  map.draw(ctx, 0, 0, map.pixelWidth, map.pixelHeight, 1 / map.tileWidth);

  return canvas;
}

function computeDisplaySize(mapWidth, mapHeight, screenH, heightFraction) {
  const height = Math.round(screenH * heightFraction);
  const width = Math.round(height * (mapWidth / mapHeight));
  return { width, height };
}

export function createMinimap(map, { heightFraction = HEIGHT_FRACTION } = {}) {
  const surface = bakeMapSurface(map);

  return {
    draw(ctx, { camera, viewW, viewH, screenH }) {
      const display = computeDisplaySize(map.width, map.height, screenH, heightFraction);
      const x = PADDING;
      const y = PADDING;
      const panelW = display.width + 4;
      const panelH = display.height + 4;

      ctx.save();
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(x, y, panelW, panelH);

      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, panelW - 1, panelH - 1);

      const mapX = x + 2;
      const mapY = y + 2;
      ctx.drawImage(surface, mapX, mapY, display.width, display.height);

      const vx = mapX + (camera.x / map.pixelWidth) * display.width;
      const vy = mapY + (camera.y / map.pixelHeight) * display.height;
      const vw = (viewW / map.pixelWidth) * display.width;
      const vh = (viewH / map.pixelHeight) * display.height;

      ctx.strokeStyle = VIEWPORT_STROKE;
      ctx.lineWidth = 1;
      ctx.strokeRect(vx + 0.5, vy + 0.5, Math.max(1, vw - 1), Math.max(1, vh - 1));

      ctx.restore();
    },
  };
}
