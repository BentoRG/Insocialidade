/**
 * Interior da casa — sub-janela no canvas com movimento normal.
 */

import { updateLocalPlayer, drawPlayer } from './player.js?v=canvas33';
import { isNearTileType } from './map.js?v=canvas28';

const MOVE_SPEED = 70;
const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';

function getInteriorLayout(screenW, screenH, map) {
  const margin = 24;
  const maxW = screenW - margin * 2;
  const maxH = screenH - margin * 2 - 48;
  const scale = Math.min(maxW / map.pixelWidth, maxH / map.pixelHeight, 5);
  const viewW = map.pixelWidth;
  const viewH = map.pixelHeight;
  const panelW = viewW * scale;
  const panelH = viewH * scale;
  const panelX = Math.round((screenW - panelW) / 2);
  const panelY = Math.round((screenH - panelH) / 2);

  return { panelX, panelY, panelW, panelH, scale, viewW, viewH };
}

function computeInteriorCamera(localPlayer, map, viewW, viewH) {
  let camX = localPlayer.x - viewW / 2;
  let camY = localPlayer.y - viewH / 2;
  camX = Math.max(0, Math.min(map.pixelWidth - viewW, camX));
  camY = Math.max(0, Math.min(map.pixelHeight - viewH, camY));
  return { x: camX, y: camY };
}

export function createHouseInteriorMinigame({
  localPlayer,
  interiorMap,
  houseId,
  exteriorX,
  exteriorY,
  onChangePassword,
  onClose,
}) {
  let destroyed = false;
  const savedExterior = { x: exteriorX, y: exteriorY };

  if (interiorMap.defaultSpawn) {
    localPlayer.x = interiorMap.defaultSpawn.x;
    localPlayer.y = interiorMap.defaultSpawn.y;
  } else if (interiorMap.spawn) {
    localPlayer.x = interiorMap.spawn.x;
    localPlayer.y = interiorMap.spawn.y;
  }

  localPlayer.moving = false;
  localPlayer.facing = 'down';

  return {
    getKind: () => 'house_interior',
    getHouseId: () => houseId,

    getState() {
      return {
        localPlayer,
        interiorMap,
        houseId,
        exteriorX: savedExterior.x,
        exteriorY: savedExterior.y,
        interiorX: localPlayer.x,
        interiorY: localPlayer.y,
        interiorFacing: localPlayer.facing,
      };
    },

    restorePosition(state) {
      if (!state) return;
      localPlayer.x = state.interiorX ?? localPlayer.x;
      localPlayer.y = state.interiorY ?? localPlayer.y;
      localPlayer.facing = state.interiorFacing ?? localPlayer.facing;
    },

    requestChangePassword() {
      onChangePassword?.(this.getState());
    },

    update(dt, input) {
      updateLocalPlayer(localPlayer, dt, interiorMap, input, MOVE_SPEED);
    },

    isNearDoor() {
      return isNearTileType(interiorMap, 'porta_casa', localPlayer.x, localPlayer.y, 1);
    },

    draw(ctx, screenW, screenH) {
      const layout = getInteriorLayout(screenW, screenH, interiorMap);
      const { panelX, panelY, panelW, panelH, scale, viewW, viewH } = layout;
      const camera = computeInteriorCamera(localPlayer, interiorMap, viewW, viewH);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      ctx.fillStyle = '#141414';
      ctx.fillRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX - 2.5, panelY - 2.5, panelW + 5, panelH + 5);

      ctx.beginPath();
      ctx.rect(panelX, panelY, panelW, panelH);
      ctx.clip();

      ctx.translate(panelX, panelY);
      ctx.scale(scale, scale);
      interiorMap.draw(ctx, camera.x, camera.y, viewW, viewH, 1);
      drawPlayer(ctx, localPlayer, camera.x, camera.y, 1, {
        showLabel: false,
        labelVariant: 'local',
      });

      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f8f3e6';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText('Interior da casa', screenW / 2, Math.max(8, panelY - 20));
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      localPlayer.x = savedExterior.x;
      localPlayer.y = savedExterior.y;
      localPlayer.moving = false;
      onClose?.();
    },
  };
}
