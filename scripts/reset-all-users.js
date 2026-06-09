#!/usr/bin/env node
/**
 * Apaga todas as contas do Insocialidade (server/data/users.json).
 *
 * Uso: node scripts/reset-all-users.js
 */

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'server', 'data', 'users.json');

function main() {
  if (!fs.existsSync(USERS_FILE)) {
    console.log('Nenhuma conta para apagar.');
    return;
  }

  let users;
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    users = {};
  }

  const keys = Object.keys(users);
  if (keys.length === 0) {
    console.log('Nenhuma conta para apagar.');
    return;
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
  console.log(`Apagadas ${keys.length} conta(s): ${keys.join(', ')}`);
}

main();
