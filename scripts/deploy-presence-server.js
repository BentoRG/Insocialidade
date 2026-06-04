#!/usr/bin/env node
/**
 * Instala e inicia o servidor WebSocket de presença (pm2).
 * Também atualiza o túnel Cloudflare n8n para expor /ws/presence.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'server');
const TUNNEL_FILE = process.env.N8N_TUNNEL_CONFIG || '/home/tim/.cloudflared/n8n-tunnel.yml';
const WS_PORT = process.env.PRESENCE_WS_PORT || '8787';
const PM2_NAME = 'insocialidade-presence';

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function ensureTunnelRoute() {
  if (!existsSync(TUNNEL_FILE)) {
    console.warn(`Túnel não encontrado em ${TUNNEL_FILE} — configure manualmente.`);
    return;
  }

  const raw = readFileSync(TUNNEL_FILE, 'utf8');
  if (raw.includes('/ws/presence')) {
    console.log('Rota /ws/presence já existe no túnel.');
    return;
  }

  const lines = raw.split('\n');
  const ingressIdx = lines.findIndex((line) => line.trim() === 'ingress:');
  if (ingressIdx === -1) {
    console.warn('ingress: não encontrado no túnel — configure manualmente.');
    return;
  }

  const insertAt = ingressIdx + 1;
  lines.splice(
    insertAt,
    0,
    '  - hostname: n8n.timgo.uk',
    '    path: /ws/presence*',
    `    service: http://localhost:${WS_PORT}`
  );
  writeFileSync(TUNNEL_FILE, lines.join('\n'));
  console.log('Rota /ws/presence adicionada ao túnel Cloudflare.');

  try {
    run('pm2 restart n8n-tunnel');
  } catch {
    console.warn('Reinicie o túnel manualmente: pm2 restart n8n-tunnel');
  }
}

function pm2Running(name) {
  try {
    execSync(`pm2 describe ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  run('npm install', SERVER_DIR);

  if (pm2Running(PM2_NAME)) {
    run(`pm2 restart ${PM2_NAME} --update-env`);
  } else {
    run(
      `pm2 start ${resolve(SERVER_DIR, 'presence-server.js')} --name ${PM2_NAME} --time`
    );
  }

  run('pm2 save');
  ensureTunnelRoute();

  console.log('');
  console.log('Presence WS ativo.');
  console.log(`Local:  ws://127.0.0.1:${WS_PORT}/ws/presence`);
  console.log('Public: wss://n8n.timgo.uk/ws/presence');
}

main();
