/**
 * Lógica da tela de autenticação (index.html).
 */

import { CHARACTER_COLORS } from './config.js';
import { register, login, getSessionProfile } from './auth.js';

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginPanel = document.getElementById('login-panel');
const registerPanel = document.getElementById('register-panel');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');
const alertBox = document.getElementById('alert');
const colorGrid = document.getElementById('color-grid');

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
  hideAlert();
  const isLogin = panel === 'login';
  loginPanel.hidden = !isLogin;
  registerPanel.hidden = isLogin;
}

function renderColorPicker() {
  colorGrid.innerHTML = CHARACTER_COLORS.map(
    (color, index) => `
    <label class="color-option" title="${color.label}">
      <input
        type="radio"
        name="character_color"
        value="${color.hex}"
        ${index === 0 ? 'checked' : ''}
        required
      />
      <span class="color-swatch" style="--swatch: ${color.hex}"></span>
      <span class="color-label">${color.label}</span>
    </label>
  `
  ).join('');
}

async function init() {
  renderColorPicker();

  const existing = await getSessionProfile();
  if (existing) {
    window.location.replace('game.html');
    return;
  }

  showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchPanel('register');
  });

  showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchPanel('login');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();
    setLoading(loginForm, true);

    try {
      await login({
        username: loginForm.username.value,
        password: loginForm.password.value,
      });
      window.location.href = 'game.html';
    } catch (err) {
      showAlert(err.message || 'Erro ao entrar.', 'error');
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

    try {
      const result = await register({
        username: registerForm.username.value,
        password: registerForm.password.value,
        confirmPassword: registerForm.confirm_password.value,
        characterColor: selectedColor,
      });
      showAlert(result.message, 'success');
      registerForm.reset();
      renderColorPicker();
      setTimeout(() => switchPanel('login'), 4000);
    } catch (err) {
      showAlert(err.message || 'Erro ao cadastrar.', 'error');
    } finally {
      setLoading(registerForm, false);
    }
  });
}

init();
