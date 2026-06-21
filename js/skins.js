/**
 * Catálogo de skins do personagem — extensível via sprite sheet.
 */

export const DEFAULT_SKIN_ID = 'default';
const SKIN_SLOT_COUNT = 20;

export const SKIN_CATALOG = [
  { id: DEFAULT_SKIN_ID, label: 'Skin Padrão', sheetIndex: 0, tint: true },
];

export const WARDROBE_SLOT_COUNT = 8;
export const WARDROBE_COLUMNS = 4;

export function getSkinById(skinId) {
  return SKIN_CATALOG.find((skin) => skin.id === skinId) || SKIN_CATALOG[0];
}

export function isSkinUnlocked(skinId, unlockedSkins) {
  return Array.isArray(unlockedSkins) && unlockedSkins.includes(skinId);
}

export function resolveSkinAppearance(skinId, registrationColor) {
  const skin = getSkinById(skinId);
  const sheetIndex = Math.max(0, Math.min(SKIN_SLOT_COUNT - 1, skin.sheetIndex ?? 0));

  if (skin.tint || skin.id === DEFAULT_SKIN_ID) {
    return {
      skinId: skin.id,
      sheetIndex,
      tint: true,
      color: registrationColor,
    };
  }

  return {
    skinId: skin.id,
    sheetIndex,
    tint: false,
    color: skin.color || registrationColor,
  };
}

export function normalizeUnlockedSkins(value) {
  if (!Array.isArray(value) || !value.length) return [DEFAULT_SKIN_ID];
  const ids = value.map((entry) => String(entry).trim()).filter(Boolean);
  return ids.includes(DEFAULT_SKIN_ID) ? ids : [DEFAULT_SKIN_ID, ...ids];
}

export function normalizeSkinState(profile = {}) {
  const registrationColor = profile.registration_color || profile.character_color || '#4a4a4a';
  const unlockedSkins = normalizeUnlockedSkins(profile.unlocked_skins);
  const activeSkinId = unlockedSkins.includes(profile.active_skin_id)
    ? profile.active_skin_id
    : DEFAULT_SKIN_ID;
  const appearance = resolveSkinAppearance(activeSkinId, registrationColor);

  return {
    registrationColor,
    activeSkinId,
    unlockedSkins,
    characterColor: appearance.color,
    sheetIndex: appearance.sheetIndex,
    tint: appearance.tint,
  };
}
