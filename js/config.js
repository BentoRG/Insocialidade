/**
 * CONFIGURAÇÃO — Insocialidade
 * =============================
 * Backend de auth via webhook n8n (n8n.timgo.uk).
 * Telegram e armazenamento de usuários ficam no servidor — nada sensível no front-end.
 */

/** Incrementar ao publicar — força o navegador a baixar JS/CSS novos. */
export const ASSET_VERSION = 'canvas4';

export const CONFIG = {
  // URL do webhook n8n (workflow "Insocialidade Auth")
  API_URL: 'https://n8n.timgo.uk/webhook/insocialidade-auth',

  // Chave usada para assinar tokens de sessão (mesmo valor no workflow n8n)
  SESSION_SECRET: 'insocialidade-session-v1',

  // Segredo nos links de aprovação/rejeição enviados ao Telegram
  APPROVAL_SECRET: 'insocialidade-approve-2026',

  // Chat ID do administrador que recebe pedidos de aprovação (@InsocialidadeBot)
  TELEGRAM_ADMIN_CHAT_ID: '8670179404',

  // ID numérico do @InsocialidadeBot (BotFather)
  TELEGRAM_BOT_ID: '8773138632',

  APP_NAME: 'Insocialidade',
  LOGIN_PAGE: 'index.html',
  GAME_PAGE: 'game.html',
  SESSION_KEY: 'insocialidade_session',
  PENDING_USER_KEY: 'insocialidade_pending_user',
  STATUS_POLL_MS: 5000,
  PRESENCE_POLL_MS: 2000,
  PRESENCE_STALE_MS: 15000,
  MAP_URL: 'assets/maps/starter.tmj',
};

/** Resolve caminhos de assets relativos à pasta do jogo (game.html). */
export function resolveAsset(relativePath) {
  const gameBase = new URL('game.html', window.location.href);
  return new URL(relativePath.replace(/^\//, ''), gameBase).href;
}

/** Paleta oficial do personagem / identidade visual */
export const CHARACTER_COLORS = [
  { id: 'shadow', hex: '#222233', label: 'Sombra' },
  { id: 'slate', hex: '#474b6b', label: 'Ardósia' },
  { id: 'bronze', hex: '#b89b6d', label: 'Bronze' },
  { id: 'sand', hex: '#e6d3a3', label: 'Areia' },
  { id: 'cream', hex: '#f8f3e6', label: 'Creme' },
];
