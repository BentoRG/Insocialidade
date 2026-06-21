/**
 * Casa Armário — overlay de inventário de skins no canvas principal.
 */

import {
  DEFAULT_SKIN_ID,
  SKIN_CATALOG,
  WARDROBE_COLUMNS,
  WARDROBE_SLOT_COUNT,
  isSkinUnlocked,
  resolveSkinAppearance,
} from '../skins.js';
import { saveActiveSkin } from '../skin-store.js';
import { drawPlayer } from './player.js?v=canvas30';

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const PANEL_BG = '#141414';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const TEXT_COLOR = '#f8f3e6';
const MUTED_COLOR = '#e6d3a3';
const SELECTED_BORDER = '#f8f3e6';
const LOCKED_COLOR = 'rgba(248, 243, 230, 0.35)';

function buildSlots(unlockedSkins) {
  const slots = [];

  for (let index = 0; index < WARDROBE_SLOT_COUNT; index++) {
    const catalogSkin = SKIN_CATALOG[index] || null;
    if (catalogSkin) {
      slots.push({
        index,
        skinId: catalogSkin.id,
        label: catalogSkin.label,
        style: catalogSkin.style,
        unlocked: isSkinUnlocked(catalogSkin.id, unlockedSkins),
        placeholder: false,
      });
      continue;
    }

    slots.push({
      index,
      skinId: null,
      label: 'Em breve',
      style: 'classic',
      unlocked: false,
      placeholder: true,
    });
  }

  return slots;
}

function slotAt(slots, index) {
  return slots[index] || slots[0];
}

function moveSelection(selectedIndex, dx, dy) {
  const row = Math.floor(selectedIndex / WARDROBE_COLUMNS);
  const col = selectedIndex % WARDROBE_COLUMNS;
  const nextRow = Math.max(0, Math.min(Math.ceil(WARDROBE_SLOT_COUNT / WARDROBE_COLUMNS) - 1, row + dy));
  const nextCol = Math.max(0, Math.min(WARDROBE_COLUMNS - 1, col + dx));
  return Math.max(0, Math.min(WARDROBE_SLOT_COUNT - 1, nextRow * WARDROBE_COLUMNS + nextCol));
}

function directionFromInput(input) {
  const { dx, dy } = input.getDirection();
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

function drawSlotPreview(ctx, x, y, size, color, style, selected, unlocked, placeholder) {
  ctx.fillStyle = selected ? '#1f1f1f' : PANEL_BG;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = selected ? SELECTED_BORDER : unlocked ? PANEL_BORDER : LOCKED_COLOR;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  if (placeholder || !unlocked) {
    ctx.fillStyle = LOCKED_COLOR;
    ctx.font = '18px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', x + size / 2, y + size / 2 - 8);
    return;
  }

  const previewScale = Math.max(2, Math.floor(size / 18));
  const centerX = x + size / 2;
  const centerY = y + size / 2 + 8;
  drawPlayer(
    ctx,
    {
      x: centerX,
      y: centerY,
      color,
      skinStyle: style,
      facing: 'down',
      moving: false,
      animFrame: 0,
    },
    centerX,
    centerY,
    previewScale,
    { showLabel: false }
  );
}

export function createWardrobeMinigame({
  userId,
  token,
  registrationColor,
  initialActiveSkinId = DEFAULT_SKIN_ID,
  initialUnlockedSkins = [DEFAULT_SKIN_ID],
  onEquip,
  onClose,
} = {}) {
  let activeSkinId = initialActiveSkinId;
  let unlockedSkins = [...initialUnlockedSkins];
  let slots = buildSlots(unlockedSkins);
  let selectedIndex = Math.max(
    0,
    slots.findIndex((slot) => slot.skinId === activeSkinId)
  );
  let statusMessage = 'Setas para escolher · Enter para equipar';
  let moveCooldown = 0;

  function applyAppearance(skinId) {
    return resolveSkinAppearance(skinId, registrationColor);
  }

  async function equipSelectedSlot() {
    const slot = slotAt(slots, selectedIndex);
    if (!slot.unlocked || !slot.skinId || slot.placeholder) {
      statusMessage = 'Esta skin ainda não está disponível.';
      return;
    }

    activeSkinId = slot.skinId;
    statusMessage = 'Equipando…';

    const saved = await saveActiveSkin(userId, token, slot.skinId, {
      registration_color: registrationColor,
      active_skin_id: activeSkinId,
      unlocked_skins: unlockedSkins,
      character_color: applyAppearance(slot.skinId).color,
    });

    activeSkinId = saved.activeSkinId;
    unlockedSkins = saved.unlockedSkins;
    slots = buildSlots(unlockedSkins);
    statusMessage =
      slot.skinId === saved.activeSkinId ? 'Skin equipada!' : 'Não foi possível equipar.';

    onEquip?.({
      skinId: saved.activeSkinId,
      skinStyle: saved.skinStyle,
      characterColor: saved.characterColor,
    });
  }

  return {
    getKind() {
      return 'wardrobe';
    },

    getActiveSkinId() {
      return activeSkinId;
    },

    update(dt, input) {
      moveCooldown = Math.max(0, moveCooldown - dt * 1000);

      const dir = directionFromInput(input);
      if (dir && moveCooldown <= 0) {
        if (dir === 'left') selectedIndex = moveSelection(selectedIndex, -1, 0);
        if (dir === 'right') selectedIndex = moveSelection(selectedIndex, 1, 0);
        if (dir === 'up') selectedIndex = moveSelection(selectedIndex, 0, -1);
        if (dir === 'down') selectedIndex = moveSelection(selectedIndex, 0, 1);
        moveCooldown = 140;
      }

      if (input.consumeDigit?.(1)) selectedIndex = 0;

      if (input.consumeConfirm?.()) {
        void equipSelectedSlot();
      }
    },

    draw(ctx, screenW, screenH) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      const margin = 16;
      const slotSize = Math.min(88, Math.floor((screenW - margin * 2) / WARDROBE_COLUMNS - 10));
      const gridW = WARDROBE_COLUMNS * slotSize + (WARDROBE_COLUMNS - 1) * 10;
      const rows = Math.ceil(WARDROBE_SLOT_COUNT / WARDROBE_COLUMNS);
      const gridH = rows * slotSize + (rows - 1) * 10;
      const gridX = Math.round((screenW - gridW) / 2);
      const gridY = Math.round((screenH - gridH) / 2);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '16px ui-monospace, monospace';
      ctx.fillText('Casa Armário', screenW / 2, margin);

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('Suas skins', screenW / 2, margin + 22);

      for (const slot of slots) {
        const row = Math.floor(slot.index / WARDROBE_COLUMNS);
        const col = slot.index % WARDROBE_COLUMNS;
        const x = gridX + col * (slotSize + 10);
        const y = gridY + row * (slotSize + 10);
        const appearance = slot.skinId
          ? applyAppearance(slot.skinId)
          : { color: registrationColor, style: 'classic' };

        drawSlotPreview(
          ctx,
          x,
          y,
          slotSize,
          appearance.color,
          appearance.style,
          slot.index === selectedIndex,
          slot.unlocked,
          slot.placeholder
        );

        ctx.fillStyle = slot.unlocked ? MUTED_COLOR : LOCKED_COLOR;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(slot.label, x + slotSize / 2, y + slotSize + 4);

        if (slot.skinId && slot.skinId === activeSkinId) {
          ctx.fillStyle = TEXT_COLOR;
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillText('Equipada', x + slotSize / 2, y - 12);
        }
      }

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(statusMessage, screenW / 2, gridY + gridH + 18);
      ctx.fillText('Tecla 1 seleciona a skin padrão', screenW / 2, gridY + gridH + 34);

      ctx.restore();
    },

    destroy() {
      onClose?.();
    },
  };
}
