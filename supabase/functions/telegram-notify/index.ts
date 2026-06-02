/**
 * Edge Function Supabase — proxy seguro para notificações Telegram
 * Use quando NÃO quiser expor TELEGRAM_BOT_TOKEN no front-end.
 *
 * Deploy:
 *   supabase functions deploy telegram-notify
 *
 * Em js/config.js:
 *   TELEGRAM_PROXY_URL = 'https://SEU_PROJETO.supabase.co/functions/v1/telegram-notify'
 *   TELEGRAM_BOT_TOKEN = ''  (deixe vazio)
 *
 * Secrets:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_ADMIN_CHAT_ID
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');

  if (!token || !chatId) {
    return new Response(JSON.stringify({ error: 'Telegram not configured' }), { status: 500 });
  }

  const { message } = await req.json();

  if (!message) {
    return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400 });
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.ok ? 200 : 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
