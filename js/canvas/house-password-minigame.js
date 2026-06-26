/**
 * Senha da casa — overlay no canvas (entrada ou alteração).
 */

import { verifyHousePassword, setHousePassword } from '../house-password-store.js?v=housepwd1';

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const PANEL_BG = '#141414';
const PANEL_BORDER = 'rgba(248, 243, 230, 0.85)';
const TEXT_COLOR = '#f8f3e6';
const MUTED_COLOR = '#e6d3a3';
const ERROR_COLOR = '#e57373';

function getPanelLayout(screenW, screenH) {
  const panelW = Math.min(320, screenW - 32);
  const panelH = 160;
  return {
    x: Math.round((screenW - panelW) / 2),
    y: Math.round((screenH - panelH) / 2),
    w: panelW,
    h: panelH,
  };
}

function isFourDigits(value) {
  return /^\d{4}$/.test(String(value || '').trim());
}

export function createHousePasswordMinigame({
  mode = 'enter',
  houseId,
  token,
  panelEl,
  inputEl,
  errorEl,
  confirmBtn,
  cancelBtn,
  onSuccess,
  onCancel,
  onClose,
}) {
  let destroyed = false;
  let submitting = false;
  let succeeded = false;
  let errorMessage = '';

  const question =
    mode === 'set'
      ? 'Nova senha (4 digitos):'
      : 'Qual eh a senha pra entrar nessa casa?';

  function setError(message) {
    errorMessage = message || '';
    if (errorEl) {
      errorEl.textContent = errorMessage;
      errorEl.hidden = !errorMessage;
    }
  }

  function showPanel() {
    if (!panelEl) return;
    panelEl.hidden = false;
    if (inputEl) {
      inputEl.value = '';
      requestAnimationFrame(() => inputEl.focus());
    }
    setError('');
  }

  function hidePanel() {
    if (panelEl) panelEl.hidden = true;
    if (inputEl) inputEl.value = '';
    setError('');
  }

  async function submit() {
    if (submitting || destroyed) return;

    const guess = inputEl?.value?.trim() || '';
    if (!isFourDigits(guess)) {
      setError('Digite 4 numeros.');
      return;
    }

    submitting = true;
    setError('');

    try {
      if (mode === 'enter') {
        const valid = await verifyHousePassword(token, houseId, guess);
        if (!valid) {
          setError('Senha incorreta.');
          submitting = false;
          return;
        }
        hidePanel();
        succeeded = true;
        onSuccess?.();
        return;
      }

      await setHousePassword(token, houseId, guess);
      hidePanel();
      succeeded = true;
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Erro ao salvar senha.');
    } finally {
      submitting = false;
    }
  }

  function onConfirmClick(event) {
    event.preventDefault();
    void submit();
  }

  function onCancelClick(event) {
    event.preventDefault();
    if (destroyed) return;
    hidePanel();
    onCancel?.();
  }

  function onInputKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  }

  showPanel();
  confirmBtn?.addEventListener('click', onConfirmClick);
  cancelBtn?.addEventListener('click', onCancelClick);
  inputEl?.addEventListener('keydown', onInputKeyDown);

  return {
    getKind: () => 'house_password',
    getMode: () => mode,

    draw(ctx, screenW, screenH) {
      const panel = getPanelLayout(screenW, screenH);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);

      ctx.fillStyle = PANEL_BG;
      ctx.fillRect(panel.x - 2, panel.y - 2, panel.w + 4, panel.h + 4);
      ctx.strokeStyle = PANEL_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(panel.x - 2.5, panel.y - 2.5, panel.w + 5, panel.h + 5);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = '13px ui-monospace, monospace';
      ctx.fillText(question, screenW / 2, panel.y + 16);

      ctx.fillStyle = MUTED_COLOR;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText('Use o campo abaixo para digitar', screenW / 2, panel.y + 38);

      if (errorMessage) {
        ctx.fillStyle = ERROR_COLOR;
        ctx.font = '11px ui-monospace, monospace';
        ctx.fillText(errorMessage, screenW / 2, panel.y + panel.h - 28);
      }

      ctx.restore();
    },

    update() {},

    destroy() {
      if (destroyed) return;
      destroyed = true;
      hidePanel();
      confirmBtn?.removeEventListener('click', onConfirmClick);
      cancelBtn?.removeEventListener('click', onCancelClick);
      inputEl?.removeEventListener('keydown', onInputKeyDown);
    },
  };
}
