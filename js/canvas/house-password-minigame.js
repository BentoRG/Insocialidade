/**
 * Senha da casa — overlay no canvas (entrada ou alteração).
 */

import { verifyHousePassword, setHousePassword } from '../house-password-store.js?v=housepwd1';

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';

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

  function syncQuestionText() {
    const questionEl = panelEl?.querySelector('.game-house-password__question');
    if (questionEl) questionEl.textContent = question;
  }

  function setError(message) {
    errorMessage = message || '';
    if (errorEl) {
      errorEl.textContent = errorMessage;
      errorEl.hidden = !errorMessage;
    }
  }

  function showPanel() {
    if (!panelEl) return;
    syncQuestionText();
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
    getHouseId: () => houseId,
    allowsWorldMovement: () => mode === 'enter',

    draw(ctx, screenW, screenH) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = OVERLAY_BG;
      ctx.fillRect(0, 0, screenW, screenH);
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
