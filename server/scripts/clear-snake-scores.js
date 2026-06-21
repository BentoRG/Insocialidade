/**
 * Limpa os recordes do Jogo da Cobrinha de todos os jogadores no users.json.
 *
 * Uso: node server/scripts/clear-snake-scores.js
 */

import { createAuthStore } from '../auth-store.js';

const authStore = createAuthStore({ sessionSecret: process.env.SESSION_SECRET || 'local-clear' });
const cleared = authStore.clearAllSnakeBestScores();

console.log(`Snake records cleared for ${cleared} player(s).`);
