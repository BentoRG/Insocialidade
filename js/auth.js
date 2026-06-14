/**
 * Autenticação — login, cadastro, sessão e proteção de rotas.
 * Backend: API Node. n8n só no cadastro novo; Telegram no servidor.
 */

import { CONFIG, CHARACTER_COLORS } from './config.js?v=auth14';
import {
  apiRegister,
  apiLogin,
  apiValidateSession,
  apiCheckStatus,
  saveSession,
  clearSession,
  getStoredSession,
} from './api.js';

const VALID_COLORS = new Set(CHARACTER_COLORS.map((c) => c.hex.toLowerCase()));

function normalizeCharacterColor(hex) {
  const value = String(hex || '').trim().toLowerCase();
  return value.startsWith('#') ? value : `#${value}`;
}

/** Chave de busca — ignora maiúsculas/minúsculas, mantém acentos. */
export function normalizeUsernameKey(username) {
  return username.trim().toLocaleLowerCase('pt-BR');
}

export function isValidUsername(username) {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  return /^[\p{L}0-9_]+$/u.test(trimmed);
}

export function validatePassword(password) {
  if (password.length < 4) {
    return 'A senha deve ter pelo menos 4 caracteres.';
  }
  return null;
}

export function validatePasswords(password, confirm) {
  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  if (password !== confirm) {
    return 'As senhas não correspondem.';
  }
  return null;
}

export async function register({ username, password, confirmPassword, characterColor }) {
  const trimmed = username.trim();

  if (!isValidUsername(trimmed)) {
    throw new Error(
      'Usuário inválido. Use 3–20 caracteres: letras (com acentos), números ou _.'
    );
  }

  const passwordError = validatePasswords(password, confirmPassword);
  if (passwordError) throw new Error(passwordError);

  const normalizedColor = normalizeCharacterColor(characterColor);
  if (!VALID_COLORS.has(normalizedColor)) {
    throw new Error('Selecione uma das cores disponíveis para o personagem.');
  }

  await apiRegister({
    username: trimmed,
    password,
    characterColor: normalizedColor,
  });

  return {
    message:
      'Cadastro enviado! Aguarde a aprovação do administrador via Telegram antes de entrar.',
  };
}

export async function login({ username, password }) {
  const trimmed = username.trim();

  if (!isValidUsername(trimmed) || validatePassword(password)) {
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

const STATUS_MESSAGES = {
  pending: 'Aguardando aprovação do administrador…',
  active: 'Sua conta foi aprovada! Faça login para entrar.',
  rejected: 'Seu cadastro não foi aprovado.',
};

export function getStatusMessage(status) {
  return STATUS_MESSAGES[status] || null;
}

/** Consulta se o cadastro foi aprovado, rejeitado ou ainda está pendente. */
export async function checkApprovalStatus(username) {
  const trimmed = username.trim();
  if (!isValidUsername(trimmed)) {
    throw new Error('Usuário inválido.');
  }

  const data = await apiCheckStatus(trimmed);
  return {
    username: data.username || trimmed,
    status: data.status,
    message: getStatusMessage(data.status),
  };
}
