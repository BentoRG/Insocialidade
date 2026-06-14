/**
 * Webhook Telegram — botões aprovar/rejeitar (sem n8n).
 */

const COLOR_LABELS = {
  '#27609e': 'Azul oceano',
  '#4a4a4a': 'Cinza',
  '#4ea6ec': 'Azul céu',
  '#ffffff': 'Branco',
  '#c2a278': 'Areia',
  '#90c25e': 'Verde',
  '#4b6629': 'Musgo',
};

function colorLabel(hex) {
  const value = String(hex || '').trim().toLowerCase();
  const normalized = value.startsWith('#') ? value : `#${value}`;
  return COLOR_LABELS[normalized] || hex;
}

async function telegramApi(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function configureTelegramWebhook({ botToken, webhookUrl }) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['callback_query'],
      drop_pending_updates: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`setWebhook falhou: ${data.description}`);
  }
  return webhookUrl;
}

export function createTelegramApprovalHandler({ botToken, adminChatId, moderateUser }) {
  async function answerCallback(cq, text = '', showAlert = false) {
    if (!cq?.id) return;
    try {
      await telegramApi(botToken, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text,
        show_alert: showAlert,
      });
    } catch {
      // ignora
    }
  }

  async function clearMessageButtons(cq) {
    if (!cq?.message?.chat?.id || !cq?.message?.message_id) return;
    try {
      await telegramApi(botToken, 'editMessageReplyMarkup', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // ignora
    }
  }

  return async function handleTelegramUpdate(update) {
    const cq = update?.callback_query;
    if (!cq) return { ok: true, ignored: true };

    const fromId = String(cq.from?.id ?? '');
    if (fromId !== String(adminChatId)) {
      await answerCallback(cq, 'Você não tem permissão para isso.', true);
      return { ok: false, error: 'Sem permissão.' };
    }

    const raw = String(cq.data || '');
    const sep = raw.indexOf(':');
    const modAction = sep >= 0 ? raw.slice(0, sep) : '';
    const userId = sep >= 0 ? raw.slice(sep + 1).trim() : '';

    if (!['approve', 'reject'].includes(modAction)) {
      await answerCallback(cq, 'Ação inválida.', true);
      await clearMessageButtons(cq);
      return { ok: false, error: 'Ação inválida.' };
    }

    await answerCallback(
      cq,
      modAction === 'approve' ? 'Usuário aprovado!' : 'Usuário rejeitado.'
    );

    const result = await moderateUser({ userId, action: modAction });
    if (!result.ok) {
      await answerCallback(cq, result.error || 'Cadastro não encontrado.', true);
      await clearMessageButtons(cq);
      return result;
    }

    const resultText =
      '🎮 Insocialidade — cadastro\n\n' +
      `👤 ${result.username || userId}\n` +
      `🎨 ${colorLabel(result.character_color)}\n\n` +
      (modAction === 'approve' ? '✅ Aprovado — já pode entrar.' : '❌ Não aprovado.');

    try {
      await telegramApi(botToken, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: resultText,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      await clearMessageButtons(cq);
    }

    return { ok: true };
  };
}
