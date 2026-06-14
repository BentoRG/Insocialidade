/**
 * CONFIGURAÇÃO — Insocialidade
 * =============================
 * Auth e cadastro via api.gepetodigital.com (Node).
 * Aprovação de novos cadastros: n8n avisa Telegram; botões são tratados no servidor Node.
 * Tempo real (presença, chat) via WebSocket em ws.gepetodigital.com.
 */

/** Incrementar ao publicar mapa/paleta — força download de TMJ, PNG e JS. */
export const ASSET_VERSION = 'palette8';

export const CONFIG = {
  // URL da API de auth (gepetodigital.com quando DNS propagar; timgo.uk ativo agora)
  API_URL: 'https://api-insocialidade.timgo.uk/auth',

  // Chave usada para assinar tokens de sessão (mesmo valor no servidor)
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
  REALTIME_WS_URL: 'wss://ws-insocialidade.timgo.uk/ws',
  MAP_URL: 'assets/maps/starter.tmj',
};

/** Resolve caminhos de assets relativos à pasta do jogo (game.html). */
export function resolveAsset(relativePath, { bust = false } = {}) {
  let path = relativePath.replace(/^\//, '');
  if (bust) {
    const sep = path.includes('?') ? '&' : '?';
    path = `${path}${sep}v=${ASSET_VERSION}`;
  }
  const gameBase = new URL('game.html', window.location.href);
  return new URL(path, gameBase).href;
}

/** Cores disponíveis no cadastro — escolha permanente, não pode alterar depois. */
export const CHARACTER_COLORS = [
  { id: 'ocean', hex: '#27609e', label: 'Azul oceano' },
  { id: 'gray', hex: '#4a4a4a', label: 'Cinza' },
  { id: 'sky', hex: '#4ea6ec', label: 'Azul céu' },
  { id: 'white', hex: '#ffffff', label: 'Branco' },
  { id: 'sand', hex: '#c2a278', label: 'Areia' },
  { id: 'lime', hex: '#90c25e', label: 'Verde' },
  { id: 'moss', hex: '#4b6629', label: 'Musgo' },
];
