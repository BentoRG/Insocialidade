/**
 * Lógica da tela do jogo (game.html).
 * requireAuth() é executado imediatamente — bloqueia acesso direto à URL.
 */

import { requireAuth, logout } from './auth.js';

const playerName = document.getElementById('player-name');
const playerAvatar = document.getElementById('player-avatar');
const logoutBtn = document.getElementById('logout-btn');
const gameRoot = document.getElementById('game-root');

async function init() {
  const profile = await requireAuth();

  if (!profile) return;

  gameRoot.hidden = false;
  playerName.textContent = profile.username;
  playerAvatar.style.backgroundColor = profile.character_color;

  logoutBtn.addEventListener('click', () => logout());
}

init();
