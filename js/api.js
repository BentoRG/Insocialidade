/**
 * Cliente HTTP para a API de auth (api.gepetodigital.com).
 */

import { CONFIG } from './config.js?v=auth16';

async function apiRequest(action, payload = {}) {
  const response = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Resposta inválida do servidor.');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || 'Erro na requisição.');
  }

  return data;
}

export function saveSession(token, profile) {
  localStorage.setItem(
    CONFIG.SESSION_KEY,
    JSON.stringify({ token, profile, savedAt: Date.now() })
  );
}

export function clearSession() {
  localStorage.removeItem(CONFIG.SESSION_KEY);
}

export function getStoredSession() {
  const raw = localStorage.getItem(CONFIG.SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    clearSession();
    return null;
  }
}

export async function apiRegister(payload) {
  return apiRequest('register', payload);
}

export async function apiLogin(payload) {
  return apiRequest('login', payload);
}

export async function apiValidateSession(token) {
  return apiRequest('session', { token });
}

export async function apiCheckStatus(username) {
  return apiRequest('status', { username });
}

export async function apiListMembers(token) {
  return apiRequest('members', { token });
}
