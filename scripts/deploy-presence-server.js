#!/usr/bin/env node
/**
 * Instala e inicia o servidor Insocialidade (auth + WebSocket) via pm2.
 * Configura rotas no túnel Cloudflare gepetodigital.com:
 *   api.gepetodigital.com  → auth HTTP
 *   ws.gepetodigital.com   → WebSocket /ws
 *   n8n.gepetodigital.com  → n8n local (aprovação Telegram)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'server');
const TUNNEL_FILE =
  process.env.GEPETO_TUNNEL_CONFIG || '/home/tim/.cloudflared/gepeto-tunnel.yml';
const WS_PORT = process.env.PRESENCE_WS_PORT || '8787';
const WS_PATH = process.env.PRESENCE_WS_PATH || '/ws';
const N8N_PORT = process.env.N8N_PORT || '5678';
const PM2_NAME = 'insocialidade-presence';
const TUNNEL_PM2_NAME = 'gepeto-tunnel';
const TUNNEL_ID = 'fc3b3dfb-4641-4cdd-b3d4-c03ca64187ae';

const ROUTES = [
  {
    hostname: 'api.gepetodigital.com',
    service: `http://localhost:${WS_PORT}`,
  },
  {
    hostname: 'ws.gepetodigital.com',
    path: `${WS_PATH}*`,
    service: `http://localhost:${WS_PORT}`,
  },
  {
    hostname: 'n8n.gepetodigital.com',
    service: `http://localhost:${N8N_PORT}`,
  },
];

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function runQuiet(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function routeBlock(route) {
  const lines = [`  - hostname: ${route.hostname}`];
  if (route.path) lines.push(`    path: ${route.path}`);
  lines.push(`    service: ${route.service}`);
  return lines;
}

function ensureTunnelRoutes() {
  if (!existsSync(TUNNEL_FILE)) {
    console.warn(`Túnel não encontrado em ${TUNNEL_FILE}`);
    console.warn('Crie o arquivo com ingress para gepetodigital.com (veja .env.example).');
    return false;
  }

  const raw = readFileSync(TUNNEL_FILE, 'utf8');
  const missing = ROUTES.filter((route) => !raw.includes(`hostname: ${route.hostname}`));

  if (missing.length === 0) {
    console.log('Rotas do túnel gepeto já configuradas.');
    return false;
  }

  const lines = raw.split('\n');
  const catchAllIdx = lines.findIndex(
    (line) => line.trim() === '- service: http_status:404'
  );
  const insertAt = catchAllIdx >= 0 ? catchAllIdx : lines.length;

  const newBlocks = missing.flatMap((route) => routeBlock(route));
  lines.splice(insertAt, 0, ...newBlocks);
  writeFileSync(TUNNEL_FILE, lines.join('\n'));
  console.log('Rotas adicionadas ao túnel:', missing.map((r) => r.hostname).join(', '));
  return true;
}

function ensureDnsRecords() {
  for (const route of ROUTES) {
    const hostname = route.hostname;
    const ok = runQuiet(
      `cloudflared tunnel route dns ${TUNNEL_ID} ${hostname}`
    );
    if (ok) {
      console.log(`DNS: ${hostname}`);
    } else {
      console.warn(
        `DNS ${hostname}: configure manualmente (CNAME → ${TUNNEL_ID}.cfargotunnel.com) se necessário.`
      );
    }
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

  const tunnelChanged = ensureTunnelRoutes();
  ensureDnsRecords();

  if (tunnelChanged) {
    try {
      run(`pm2 restart ${TUNNEL_PM2_NAME}`);
    } catch {
      console.warn(`Reinicie o túnel manualmente: pm2 restart ${TUNNEL_PM2_NAME}`);
    }
  }

  console.log('');
  console.log('Servidor Insocialidade ativo.');
  console.log(`Auth:     https://api.gepetodigital.com/auth`);
  console.log(`Realtime: wss://ws.gepetodigital.com${WS_PATH}`);
  console.log(`n8n:      https://n8n.gepetodigital.com`);
}

main();
