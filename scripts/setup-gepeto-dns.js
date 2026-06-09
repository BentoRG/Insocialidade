#!/usr/bin/env node
/**
 * Provisiona DNS para Insocialidade via Cloudflare API (timgo.uk)
 * e exibe instruções para gepetodigital.com (zona externa).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const TUNNEL_ID = 'fc3b3dfb-4641-4cdd-b3d4-c03ca64187ae';
const TUNNEL_TARGET = `${TUNNEL_ID}.cfargotunnel.com`;
const TIMGO_ZONE_ID = 'cb2142b4b7d19097a8b5c8560568877b';

const TIMGO_HOSTS = ['api-insocialidade', 'ws-insocialidade'];

function getCfToken() {
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN;
  const certPath = process.env.CF_CERT_PATH || '/home/tim/.cloudflared/cert.pem';
  if (!existsSync(certPath)) return null;
  const raw = readFileSync(certPath, 'utf8').split('-----')[2].trim().replace(/\n/g, '');
  const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  return data.apiToken || null;
}

async function cfApi(token, method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.[0]?.message || JSON.stringify(data.errors);
    throw new Error(msg);
  }
  return data.result;
}

async function ensureCname(token, zoneId, name, content) {
  const fqdn = name.includes('.') ? name : `${name}.timgo.uk`;
  const existing = await cfApi(
    token,
    'GET',
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(fqdn)}`
  );

  if (existing.some((r) => r.content === content)) {
    console.log(`DNS ok: ${fqdn}`);
    return;
  }

  if (existing.length) {
    await cfApi(token, 'PUT', `/zones/${zoneId}/dns_records/${existing[0].id}`, {
      type: 'CNAME',
      name: fqdn,
      content,
      proxied: true,
      ttl: 1,
    });
    console.log(`DNS atualizado: ${fqdn}`);
    return;
  }

  await cfApi(token, 'POST', `/zones/${zoneId}/dns_records`, {
    type: 'CNAME',
    name: fqdn,
    content,
    proxied: true,
    ttl: 1,
  });
  console.log(`DNS criado: ${fqdn}`);
}

async function provisionTimgoDns() {
  const token = getCfToken();
  if (!token) {
    console.warn('Token Cloudflare não encontrado — pulando DNS timgo.uk.');
    return false;
  }

  for (const host of TIMGO_HOSTS) {
    await ensureCname(token, TIMGO_ZONE_ID, host, TUNNEL_TARGET);
  }
  return true;
}

function printGepetoInstructions() {
  console.log('');
  console.log('gepetodigital.com (zona separada — criar manualmente no painel Cloudflare):');
  for (const host of ['api', 'ws', 'n8n']) {
    console.log(`  ${host}.gepetodigital.com  →  ${TUNNEL_TARGET}`);
  }
}

async function main() {
  await provisionTimgoDns();
  printGepetoInstructions();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
