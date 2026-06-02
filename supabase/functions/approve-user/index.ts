/**
 * Edge Function Supabase — aprovação/rejeição via link do Telegram
 *
 * Deploy:
 *   supabase functions deploy approve-user --no-verify-jwt
 *
 * Secrets (Dashboard > Edge Functions > Secrets):
 *   APPROVAL_SECRET       — mesmo valor de js/config.js
 *   TELEGRAM_BOT_TOKEN    — token do bot
 *   TELEGRAM_ADMIN_CHAT_ID — chat ID do admin (confirmação)
 *   SUPABASE_SERVICE_ROLE_KEY — já disponível no ambiente Supabase
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'text/html; charset=utf-8',
};

function html(title: string, body: string) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:sans-serif;background:#222233;color:#f8f3e6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#2a2a3d;padding:2rem;border-radius:12px;border:1px solid #474b6b;max-width:420px;text-align:center}</style></head>
<body><div class="card">${body}</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const userId = url.searchParams.get('userId');
  const action = url.searchParams.get('action');

  if (secret !== Deno.env.get('APPROVAL_SECRET')) {
    return new Response(html('Erro', '<h2>Acesso negado</h2>'), { status: 403, headers: corsHeaders });
  }

  if (!userId || !['approve', 'reject'].includes(action ?? '')) {
    return new Response(html('Erro', '<h2>Parâmetros inválidos</h2>'), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const newStatus = action === 'approve' ? 'active' : 'rejected';

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ status: newStatus })
    .eq('id', userId)
    .select('username')
    .single();

  if (error) {
    return new Response(html('Erro', `<h2>Falha ao atualizar</h2><p>${error.message}</p>`), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID');

  if (token && chatId) {
    const emoji = newStatus === 'active' ? '✅' : '❌';
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${emoji} Usuário \`${profile.username}\` foi ${newStatus === 'active' ? 'aprovado' : 'rejeitado'}.`,
        parse_mode: 'Markdown',
      }),
    });
  }

  const msg =
    newStatus === 'active'
      ? `<h2>Conta aprovada!</h2><p>O usuário <strong>${profile.username}</strong> já pode entrar.</p>`
      : `<h2>Conta rejeitada</h2><p>O usuário <strong>${profile.username}</strong> foi notificado.</p>`;

  return new Response(html('Insocialidade', msg), { headers: corsHeaders });
});
