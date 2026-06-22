/**
 * Catálogo de skins do personagem — extensível via sprite sheet.
 */

export const DEFAULT_SKIN_ID = 'default';
export const A_BRASILEIRA_SKIN_ID = 'a_brasileira';
export const REGISTRATION_PLACEHOLDER_COLOR = '#990030';
const SKIN_SLOT_COUNT = 20;

export const ALWAYS_UNLOCKED_SKIN_IDS = [DEFAULT_SKIN_ID, A_BRASILEIRA_SKIN_ID];

export const SKIN_CATALOG = [
  { id: DEFAULT_SKIN_ID, label: 'Skin Padrão', sheetIndex: 0, tint: 'placeholder' },
  { id: 'stick_man', label: 'Stick Man', sheetIndex: 1, tint: 'placeholder' },
  { id: 'tree_disguise', label: 'Desfarce de Árvore', sheetIndex: 2, tint: 'placeholder' },
  { id: A_BRASILEIRA_SKIN_ID, label: 'À Brasileira', sheetIndex: 3, tint: false },
];

export const SNAKE_SKIN_UNLOCK_BY_PHASE = {
  2: 'stick_man',
  3: 'tree_disguise',
};

export const WARDROBE_SLOT_COUNT = 8;
export const WARDROBE_COLUMNS = 4;

export function getSkinById(skinId) {
  return SKIN_CATALOG.find((skin) => skin.id === skinId) || SKIN_CATALOG[0];
}

export function getSnakeSkinUnlockId(phaseId) {
  const phase = Math.max(1, Math.min(3, Math.floor(Number(phaseId) || 1)));
  return SNAKE_SKIN_UNLOCK_BY_PHASE[phase] || null;
}

export function getSkinLabel(skinId) {
  return getSkinById(skinId).label;
}

export const WARDROBE_EQUIP_LOCATION = 'Casa Armário, na Vila 01';

export function isSkinUnlocked(skinId, unlockedSkins) {
  return Array.isArray(unlockedSkins) && unlockedSkins.includes(skinId);
}

export function resolveSkinAppearance(skinId, registrationColor) {
  const skin = getSkinById(skinId);
  const sheetIndex = Math.max(0, Math.min(SKIN_SLOT_COUNT - 1, skin.sheetIndex ?? 0));
  const tintMode =
    skin.tint === 'placeholder'
      ? 'placeholder'
      : skin.tint === 'full' || skin.tint === true
        ? 'full'
        : false;

  if (tintMode) {
    return {
      skinId: skin.id,
      sheetIndex,
      tint: tintMode,
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

export function listWardrobeSkins(unlockedSkins) {
  const unlocked = normalizeUnlockedSkins(unlockedSkins);
  return SKIN_CATALOG.filter((skin) => unlocked.includes(skin.id));
}

export function normalizeUnlockedSkins(value) {
  const merged = [...ALWAYS_UNLOCKED_SKIN_IDS];
  if (!Array.isArray(value) || !value.length) return merged;

  for (const entry of value) {
    const id = String(entry).trim();
    if (id && !merged.includes(id)) merged.push(id);
  }

  return merged;
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
