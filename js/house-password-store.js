/**
 * Senhas de casas — servidor (nunca expõe a senha armazenada).
 */

import { apiSetHousePassword, apiVerifyHousePassword } from './api.js';

export async function verifyHousePassword(token, houseId, guess) {
  const data = await apiVerifyHousePassword(token, houseId, guess);
  return Boolean(data.valid);
}

export async function setHousePassword(token, houseId, password) {
  await apiSetHousePassword(token, houseId, password);
}
