/**
 * Minimapa — pré-render do terreno + marcador da posição do jogador.
 */

const PANEL_BG = 'rgba(0, 0, 0, 0.55)';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const PLAYER_MARKER_FILL = 'rgba(255, 255, 255, 0.95)';
const PLAYER_MARKER_STROKE = 'rgba(0, 0, 0, 0.9)';

function bakeMapSurface(map) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  map.draw(ctx, 0, 0, map.pixelWidth, map.pixelHeight, 1 / map.tileWidth, { outlines: false });

  return canvas;
}

function computeDisplaySize(mapWidth, mapHeight, screenH, heightFraction) {
  const height = Math.round(screenH * heightFraction);
  const width = Math.round(height * (mapWidth / mapHeight));
  return { width, height };
}

export function createMinimap(map) {
  const surface = bakeMapSurface(map);

  return {
    draw(ctx, { playerX, playerY, screenW, screenH, heightFraction }) {
      const display = computeDisplaySize(map.width, map.height, screenH, heightFraction);
      const panelW = display.width + 4;
      const panelH = display.height + 4;
      const x = Math.round((screenW - panelW) / 2);
      const y = Math.round((screenH - panelH) / 2);

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

      const markerX = mapX + (playerX / map.pixelWidth) * display.width;
      const markerY = mapY + (playerY / map.pixelHeight) * display.height;
      const markerRadius = 3;

      ctx.fillStyle = PLAYER_MARKER_FILL;
      ctx.strokeStyle = PLAYER_MARKER_STROKE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    },
  };
}
