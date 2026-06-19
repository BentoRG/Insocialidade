/**
 * Armazenamento e lógica de autenticação — usuários, tokens e aprovação.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, 'data');
const USERS_FILE = resolve(DATA_DIR, 'users.json');

const VALID_CHARACTER_COLORS = new Set([
  '#27609e',
  '#4a4a4a',
  '#4ea6ec',
  '#ffffff',
  '#c2a278',
  '#90c25e',
  '#4b6629',
]);

export function createAuthStore({ sessionSecret }) {
  if (!sessionSecret) throw new Error('sessionSecret is required');

  /** @type {Record<string, object>} */
  let users = {};
  let writeQueue = Promise.resolve();

  function loadUsers() {
    if (!existsSync(USERS_FILE)) {
      users = {};
      return;
    }
    try {
      users = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
    } catch {
      users = {};
    }
  }

  function persistUsers() {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }

  function enqueuePersist() {
    writeQueue = writeQueue.then(() => persistUsers());
    return writeQueue;
  }

  loadUsers();

  function simpleHash(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) + hash + input.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(16);
  }

  function randomId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function usernameKey(name) {
    return String(name || '').trim().toLocaleLowerCase('pt-BR');
  }

  function isValidUsername(name) {
    const trimmed = String(name || '').trim();
    if (trimmed.length < 3 || trimmed.length > 20) return false;
    return /^[\p{L}0-9_]+$/u.test(trimmed);
  }

  function normalizeCharacterColor(hex) {
    const value = String(hex || '').trim().toLowerCase();
    return value.startsWith('#') ? value : `#${value}`;
  }

  function hashPassword(password, salt) {
    return simpleHash(`${salt}:${password}:${sessionSecret}`);
  }

  function createToken(userId) {
    const iat = Date.now();
    const sig = simpleHash(`${sessionSecret}${userId}${iat}`);
    return Buffer.from(JSON.stringify({ sub: userId, iat, sig })).toString('base64');
  }

  function verifyToken(token) {
    if (!token) return null;
    try {
      const data = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      if (!data?.sub || !data?.iat || !data?.sig) return null;
      if (Date.now() - data.iat > 7 * 24 * 60 * 60 * 1000) return null;
      if (simpleHash(`${sessionSecret}${data.sub}${data.iat}`) !== data.sig) return null;
      return String(data.sub);
    } catch {
      return null;
    }
  }

  function publicProfile(user) {
    return {
      id: user.id,
      username: user.username,
      character_color: user.character_color,
      status: user.status,
    };
  }

  function findUserById(userId) {
    return Object.values(users).find((u) => u.id === userId) || null;
  }

  function findUserStorageKey(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    if (users[t]) return t;
    const keyed = usernameKey(t);
    if (users[keyed]) return keyed;
    const byId = findUserById(t);
    if (!byId) return null;
    return Object.keys(users).find((k) => users[k].id === byId.id) || null;
  }

  async function register({ username, password, characterColor }) {
    const displayUsername = String(username || '').trim();
    const key = usernameKey(displayUsername);
    const character = normalizeCharacterColor(characterColor);

    if (!isValidUsername(displayUsername)) {
      return {
        ok: false,
        error: 'Usuário inválido. Use 3–20 caracteres: letras (com acentos), números ou _.',
        httpStatus: 400,
      };
    }
    if (String(password || '').length < 4) {
      return { ok: false, error: 'Senha muito curta.', httpStatus: 400 };
    }
    if (!VALID_CHARACTER_COLORS.has(character)) {
      return {
        ok: false,
        error: 'Cor inválida. Escolha uma das cores do cadastro.',
        httpStatus: 400,
      };
    }

    const existing = users[key];
    if (existing) {
      if (existing.status === 'active') {
        return { ok: false, error: 'Este usuário já está em uso.', httpStatus: 409 };
      }

      if (existing.status === 'pending') {
        existing.username = displayUsername;
        existing.character_color = character;
        existing.passwordHash = hashPassword(password, existing.salt);
        users[key] = existing;
        await enqueuePersist();
        return {
          ok: true,
          message: 'Cadastro pendente. Reenviamos a solicitação no Telegram.',
          notify: { userId: existing.id, username: displayUsername, characterColor: character },
        };
      }
    }

    const salt = randomId('s_');
    const userId = randomId('u_');
    users[key] = {
      id: userId,
      username: displayUsername,
      character_color: character,
      status: 'pending',
      salt,
      passwordHash: hashPassword(password, salt),
      createdAt: new Date().toISOString(),
    };
    await enqueuePersist();

    return {
      ok: true,
      message: 'Cadastro pendente de aprovação.',
      notify: { userId, username: displayUsername, characterColor: character },
    };
  }

  function login({ username, password }) {
    const displayUsername = String(username || '').trim();
    const key = usernameKey(displayUsername);

    if (!isValidUsername(displayUsername) || String(password || '').length < 4) {
      return { ok: false, error: 'Usuário ou senha incorretos.', httpStatus: 401 };
    }

    const user = users[key];
    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      return { ok: false, error: 'Usuário ou senha incorretos.', httpStatus: 401 };
    }
    if (user.status === 'pending') {
      return {
        ok: false,
        error: 'Sua conta ainda aguarda aprovação do administrador.',
        httpStatus: 403,
      };
    }
    if (user.status === 'rejected') {
      return { ok: false, error: 'Seu cadastro foi rejeitado.', httpStatus: 403 };
    }
    if (user.status !== 'active') {
      return { ok: false, error: 'Conta inativa.', httpStatus: 403 };
    }

    return { ok: true, token: createToken(user.id), profile: publicProfile(user) };
  }

  function validateSession({ token }) {
    const userId = verifyToken(token);
    if (!userId) {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }
    const user = findUserById(userId);
    if (!user || user.status !== 'active') {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }
    return { ok: true, profile: publicProfile(user) };
  }

  function checkStatus({ username }) {
    const displayUsername = String(username || '').trim();
    const key = usernameKey(displayUsername);

    if (!isValidUsername(displayUsername)) {
      return { ok: false, error: 'Usuário inválido.', httpStatus: 400 };
    }

    const user = users[key];
    if (!user) {
      return { ok: true, status: 'none', username: displayUsername };
    }

    return { ok: true, status: user.status, username: user.username };
  }

  async function moderateUser({ userId, action }) {
    const key = findUserStorageKey(userId);
    const user = key ? users[key] : null;
    if (!user) {
      return { ok: false, error: 'Usuário não encontrado.' };
    }

    user.status = action === 'approve' ? 'active' : 'rejected';
    user.approvedAt = new Date().toISOString();
    users[key] = user;
    await enqueuePersist();

    return {
      ok: true,
      username: user.username,
      character_color: user.character_color,
      status: user.status,
    };
  }

  function importUsers(data) {
    users = data && typeof data === 'object' ? data : {};
    persistUsers();
    return Object.keys(users).length;
  }

  function resetUsers() {
    users = {};
    persistUsers();
    return 0;
  }

  function listUserKeys() {
    return Object.keys(users);
  }

  function listActiveMembers() {
    return Object.values(users)
      .filter((user) => user.status === 'active')
      .map((user) => ({
        id: user.id,
        username: user.username,
        character_color: user.character_color,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));
  }

  return {
    verifyToken,
    register,
    login,
    validateSession,
    checkStatus,
    moderateUser,
    importUsers,
    resetUsers,
    listUserKeys,
    listActiveMembers,
    getUsers: () => ({ ...users }),
  };
}
