/**
 * Lógica da tela de autenticação (index.html).
 */

import { CONFIG, CHARACTER_COLORS } from './config.js?v=auth14';
import {
  register,
  login,
  getSessionProfile,
  checkApprovalStatus,
  normalizeUsernameKey,
} from './auth.js';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginPanel = document.getElementById('login-panel');
const registerPanel = document.getElementById('register-panel');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');
const alertBox = document.getElementById('alert');
const colorGrid = document.getElementById('color-grid');

let statusPollTimer = null;

function showAlert(message, type = 'info') {
  alertBox.textContent = message;
  alertBox.className = `alert alert--${type}`;
  alertBox.hidden = false;
}

function hideAlert() {
  alertBox.hidden = true;
}

function setLoading(form, loading) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = loading;
  btn.dataset.originalText ??= btn.textContent;
  btn.textContent = loading ? 'Aguarde…' : btn.dataset.originalText;
}

function switchPanel(panel) {
  const isLogin = panel === 'login';
  loginPanel.hidden = !isLogin;
  registerPanel.hidden = isLogin;
}

function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;

      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.classList.toggle('password-toggle--visible', !visible);
      btn.setAttribute('aria-pressed', String(!visible));
      btn.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      btn.setAttribute('title', visible ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}

function renderColorPicker() {
  colorGrid.innerHTML = CHARACTER_COLORS.map(
    (color, index) => {
      const lightClass = color.hex.toLowerCase() === '#ffffff' ? ' color-swatch--light' : '';
      return `
    <label class="color-option" title="${color.label}">
      <input
        type="radio"
        name="character_color"
        value="${color.hex}"
        ${index === 0 ? 'checked' : ''}
        required
      />
      <span class="color-swatch${lightClass}" style="--swatch: ${color.hex}"></span>
      <span class="color-label">${color.label}</span>
    </label>
  `;
    }
  ).join('');
}

function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function rememberPendingUser(username) {
  sessionStorage.setItem(CONFIG.PENDING_USER_KEY, username);
}

function forgetPendingUser() {
  sessionStorage.removeItem(CONFIG.PENDING_USER_KEY);
}

async function pollApprovalStatus(username) {
  try {
    const { status, message } = await checkApprovalStatus(username);

    if (status === 'active') {
      stopStatusPolling();
      forgetPendingUser();
      loginForm.username.value = username;
      switchPanel('login');
      showAlert(message, 'success');
      return;
    }

    if (status === 'rejected') {
      stopStatusPolling();
      forgetPendingUser();
      showAlert(message, 'error');
      return;
    }

    if (status === 'pending') {
      showAlert(message, 'info');
    }
  } catch {
    // mantém polling em caso de falha temporária de rede
  }
}

function startStatusPolling(username) {
  const trimmed = normalizeUsernameKey(username);
  rememberPendingUser(trimmed);
  stopStatusPolling();
  switchPanel('login');
  void pollApprovalStatus(trimmed);
  statusPollTimer = setInterval(() => pollApprovalStatus(trimmed), CONFIG.STATUS_POLL_MS);
}

async function init() {
  initPasswordToggles();
  renderColorPicker();

  const existing = await getSessionProfile();
  if (existing) {
    window.location.replace('game.html');
    return;
  }

  const pendingUser = sessionStorage.getItem(CONFIG.PENDING_USER_KEY);
  if (pendingUser) {
    loginForm.username.value = pendingUser;
    switchPanel('login');
    startStatusPolling(pendingUser);
  } else {
    switchPanel('login');
  }

  showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideAlert();
    switchPanel('register');
  });

  showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    hideAlert();
    stopStatusPolling();
    switchPanel('login');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    setLoading(loginForm, true);

    const username = loginForm.username.value;

    try {
      await login({
        username,
        password: loginForm.password.value,
      });
      stopStatusPolling();
      forgetPendingUser();
      window.location.href = 'game.html';
    } catch (err) {
      const msg = err.message || 'Erro ao entrar.';
      showAlert(msg, 'error');

      if (msg.includes('aguarda aprovação')) {
        startStatusPolling(username);
      }
    } finally {
      setLoading(loginForm, false);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    setLoading(registerForm, true);

    const selectedColor = registerForm.querySelector(
      'input[name="character_color"]:checked'
    )?.value;

    const colorLabel =
      CHARACTER_COLORS.find((c) => c.hex === selectedColor)?.label || selectedColor;

    if (
      !confirm(
        `A cor "${colorLabel}" é permanente. Depois do cadastro você não poderá mudá-la.\n\nDeseja continuar?`
      )
    ) {
      return;
    }

    const username = registerForm.username.value;

    try {
      await register({
        username,
        password: registerForm.password.value,
        confirmPassword: registerForm.confirm_password.value,
        characterColor: selectedColor,
      });

      registerForm.reset();
      renderColorPicker();
      startStatusPolling(username);
    } catch (err) {
      showAlert(err.message || 'Erro ao cadastrar.', 'error');
    } finally {
      setLoading(registerForm, false);
    }
  });
}

init();
