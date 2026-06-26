/**
 * Senha da casa (alterar) — overlay no canvas; DOM fica em game.js.
 */

import { setHousePassword } from '../house-password-store.js?v=housepwd1';

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';

function isFourDigits(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

export function createHousePasswordMinigame({
  houseId,
  token,
  getPasswordValue,
  setError,
  clearError,
  onSuccess,
  onCancel,
}) {
  let destroyed = false;
  let submitting = false;

  async function submit() {
    if (submitting || destroyed) return;

    const guess = getPasswordValue?.()?.trim() || '';
    if (!isFourDigits(guess)) {
      setError?.('Digite 4 numeros.');
      return;
    }

    submitting = true;
    clearError?.();

    try {
      await setHousePassword(token, houseId, guess);
      onSuccess?.();
    } catch (err) {
      setError?.(err.message || 'Erro ao salvar senha.');
    } finally {
      submitting = false;
    }
  }

  function cancel() {
    if (destroyed) return;
    onCancel?.();
  }

  return {
    getKind: () => 'house_password',
    getMode: () => 'set',
    getHouseId: () => houseId,
    submit,
    cancel,

    draw(ctx, screenW, screenH) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);
      ctx.restore();
    },

    update() {},

    destroy() {
      destroyed = true;
    },
  };
}
