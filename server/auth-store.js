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

  function normalizeSnakeBestScore(value) {
    const score = Number(value);
    return Number.isFinite(score) && score >= 0 ? Math.floor(score) : 0;
  }

  function normalizeSnakePhaseId(value) {
    const phase = Number(value);
    if (!Number.isFinite(phase)) return 1;
    return Math.max(1, Math.min(3, Math.floor(phase)));
  }

  function emptySnakeBestScores() {
    return { 1: 0, 2: 0, 3: 0 };
  }

  function normalizeSnakeBestScores(user) {
    const scores = emptySnakeBestScores();
    const raw = user?.snake_best_scores;

    if (raw && typeof raw === 'object') {
      for (const phase of [1, 2, 3]) {
        scores[phase] = normalizeSnakeBestScore(raw[phase] ?? raw[String(phase)]);
      }
      return scores;
    }

    scores[1] = normalizeSnakeBestScore(user?.snake_best_score);
    return scores;
  }

  function syncSnakeBestScore(user, scores) {
    user.snake_best_scores = scores;
    user.snake_best_score = Math.max(...Object.values(scores));
  }

  const DEFAULT_SKIN_ID = 'default';

  function normalizeUnlockedSkins(value) {
    if (!Array.isArray(value) || !value.length) return [DEFAULT_SKIN_ID];
    const ids = value.map((entry) => String(entry).trim()).filter(Boolean);
    return ids.includes(DEFAULT_SKIN_ID) ? ids : [DEFAULT_SKIN_ID, ...ids];
  }

  function normalizeSkinFields(user) {
    if (!user.registration_color) {
      user.registration_color = normalizeCharacterColor(user.character_color);
    }
    user.unlocked_skins = normalizeUnlockedSkins(user.unlocked_skins);
    if (!user.unlocked_skins.includes(user.active_skin_id)) {
      user.active_skin_id = DEFAULT_SKIN_ID;
    }
    if (!user.active_skin_id) {
      user.active_skin_id = DEFAULT_SKIN_ID;
    }
  }

  function resolveSkinColor(user, skinId) {
    if (skinId === DEFAULT_SKIN_ID) {
      return normalizeCharacterColor(user.registration_color || user.character_color);
    }
    return normalizeCharacterColor(user.registration_color || user.character_color);
  }

  function publicProfile(user) {
    normalizeSkinFields(user);
    const snakeBestScores = normalizeSnakeBestScores(user);
    return {
      id: user.id,
      username: user.username,
      character_color: user.character_color,
      registration_color: user.registration_color,
      active_skin_id: user.active_skin_id,
      unlocked_skins: [...user.unlocked_skins],
      status: user.status,
      snake_best_score: Math.max(...Object.values(snakeBestScores)),
      snake_best_scores: snakeBestScores,
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
      registration_color: character,
      active_skin_id: DEFAULT_SKIN_ID,
      unlocked_skins: [DEFAULT_SKIN_ID],
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

  function clearAllSnakeBestScores() {
    let cleared = 0;

    for (const key of Object.keys(users)) {
      const user = users[key];
      if (!user) continue;

      const hadScore =
        user.snake_best_score != null ||
        (user.snake_best_scores && typeof user.snake_best_scores === 'object');

      if (!hadScore) continue;

      delete user.snake_best_score;
      delete user.snake_best_scores;
      users[key] = user;
      cleared += 1;
    }

    persistUsers();
    return cleared;
  }

  function listUserKeys() {
    return Object.keys(users);
  }

  function listAccountMembers() {
    return Object.values(users)
      .filter((user) => user.status === 'active' || user.status === 'pending')
      .map((user) => ({
        id: user.id,
        username: user.username,
        character_color: user.character_color,
      }))
      .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'));
  }

  async function saveSnakeBestScore({ token, score, phaseId }) {
    const userId = verifyToken(token);
    if (!userId) {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }

    const user = findUserById(userId);
    if (!user || user.status !== 'active') {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }

    const phase = normalizeSnakePhaseId(phaseId);
    const next = normalizeSnakeBestScore(score);
    const scores = normalizeSnakeBestScores(user);
    const current = scores[phase];
    const best = Math.max(current, next);

    if (best > current) {
      scores[phase] = best;
      syncSnakeBestScore(user, scores);
      const key = Object.keys(users).find((k) => users[k].id === userId);
      if (key) {
        users[key] = user;
        await enqueuePersist();
      }
    }

    return { ok: true, snake_best_score: user.snake_best_score, snake_best_scores: scores };
  }

  async function saveCharacterSkin({ token, activeSkinId }) {
    const userId = verifyToken(token);
    if (!userId) {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }

    const user = findUserById(userId);
    if (!user || user.status !== 'active') {
      return { ok: false, error: 'Sessão inválida.', httpStatus: 401 };
    }

    normalizeSkinFields(user);
    const skinId = String(activeSkinId || DEFAULT_SKIN_ID);
    if (!user.unlocked_skins.includes(skinId)) {
      return { ok: false, error: 'Skin indisponível.', httpStatus: 400 };
    }

    user.active_skin_id = skinId;
    user.character_color = resolveSkinColor(user, skinId);

    const key = Object.keys(users).find((k) => users[k].id === userId);
    if (key) {
      users[key] = user;
      await enqueuePersist();
    }

    return { ok: true, profile: publicProfile(user) };
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
    clearAllSnakeBestScores,
    listUserKeys,
    listAccountMembers,
    saveSnakeBestScore,
    saveCharacterSkin,
    getUsers: () => ({ ...users }),
  };
}
