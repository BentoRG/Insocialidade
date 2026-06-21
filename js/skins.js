/**
 * Catálogo de skins do personagem — extensível para novos estilos.
 */

export const DEFAULT_SKIN_ID = 'default';

export const SKIN_CATALOG = [
  { id: DEFAULT_SKIN_ID, label: 'Skin Padrão', style: 'classic' },
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

  if (skin.id === DEFAULT_SKIN_ID || skin.colorFromProfile) {
    return {
      skinId: DEFAULT_SKIN_ID,
      style: skin.style || 'classic',
      color: registrationColor,
    };
  }

  return {
    skinId: skin.id,
    style: skin.style || 'classic',
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
    skinStyle: appearance.style,
  };
}
