/**
 * Minimapa — pré-render do terreno + marcador da posição do jogador.
 */

const PANEL_BG = 'rgba(0, 0, 0, 0.55)';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const PLAYER_MARKER_FILL = '#ffffff';
const PLAYER_MARKER_STROKE = '#000000';
const PLAYER_MARKER_RING = 'rgba(255, 255, 255, 0.35)';
const PLAYER_MARKER_CROSSHAIR = 'rgba(255, 255, 255, 0.9)';

function drawPlayerMarker(ctx, x, y, scale = 1) {
  const outerRadius = 8 * scale;
  const coreRadius = 5 * scale;
  const crosshair = 10 * scale;

  ctx.fillStyle = PLAYER_MARKER_RING;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PLAYER_MARKER_CROSSHAIR;
  ctx.lineWidth = Math.max(1.5, 2 * scale);
  ctx.beginPath();
  ctx.moveTo(x - crosshair, y);
  ctx.lineTo(x + crosshair, y);
  ctx.moveTo(x, y - crosshair);
  ctx.lineTo(x, y + crosshair);
  ctx.stroke();

  ctx.fillStyle = PLAYER_MARKER_FILL;
  ctx.strokeStyle = PLAYER_MARKER_STROKE;
  ctx.lineWidth = Math.max(2, 2.5 * scale);
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

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
      const markerScale = Math.max(1, display.height / 220);

      drawPlayerMarker(ctx, markerX, markerY, markerScale);

      ctx.restore();
    },
  };
}
