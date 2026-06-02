/**
 * Autenticação — login, cadastro, sessão e proteção de rotas.
 * Backend: webhook n8n (usuários + Telegram + aprovação).
 */

import { CONFIG, CHARACTER_COLORS } from './config.js';
import {
  apiRegister,
  apiLogin,
  apiValidateSession,
  saveSession,
  clearSession,
  getStoredSession,
} from './api.js';

const VALID_COLORS = new Set(CHARACTER_COLORS.map((c) => c.hex));

export function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username.trim());
}

export function validatePasswords(password, confirm) {
  if (password.length < 6) {
    return 'A senha deve ter pelo menos 6 caracteres.';
  }
  if (password !== confirm) {
    return 'As senhas não correspondem.';
  }
  return null;
}

export async function register({ username, password, confirmPassword, characterColor }) {
  const trimmed = username.trim().toLowerCase();

  if (!isValidUsername(trimmed)) {
    throw new Error('Usuário inválido. Use 3–20 caracteres (letras, números ou _).');
  }

  const passwordError = validatePasswords(password, confirmPassword);
  if (passwordError) throw new Error(passwordError);

  if (!VALID_COLORS.has(characterColor)) {
    throw new Error('Selecione uma cor válida para o personagem.');
  }

  await apiRegister({
    username: trimmed,
    password,
    characterColor,
  });

  return {
    message:
      'Cadastro enviado! Aguarde a aprovação do administrador via Telegram antes de entrar.',
  };
}

export async function login({ username, password }) {
  const trimmed = username.trim().toLowerCase();

  if (!isValidUsername(trimmed)) {
    throw new Error('Usuário ou senha incorretos.');
  }

  const data = await apiLogin({ username: trimmed, password });

  saveSession(data.token, data.profile);
  return data.profile;
}

export async function getSessionProfile() {
  const stored = getStoredSession();
  if (!stored?.token) return null;

  try {
    const data = await apiValidateSession(stored.token);
    saveSession(stored.token, data.profile);
    return data.profile;
  } catch {
    clearSession();
    return null;
  }
}

export async function logout() {
  clearSession();
  window.location.href = CONFIG.LOGIN_PAGE;
}

/** Redireciona para index.html se não houver sessão ativa aprovada. */
export async function requireAuth() {
  const profile = await getSessionProfile();

  if (!profile) {
    window.location.replace(CONFIG.LOGIN_PAGE);
    return null;
  }

  return profile;
}
