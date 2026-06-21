/**
 * Skins equipadas — servidor + cache local por conta.
 */

import { apiSaveCharacterSkin, getStoredSession, saveSession } from './api.js';
import {
  DEFAULT_SKIN_ID,
  normalizeSkinState,
  normalizeUnlockedSkins,
  resolveSkinAppearance,
} from './skins.js';

const SKIN_STATE_KEY = 'insocialidade_skin_state';

function readStoredSkinState(userId) {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(SKIN_STATE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[userId] || null;
  } catch {
    return null;
  }
}

function writeStoredSkinState(userId, state) {
  if (!userId) return;

  try {
    const raw = localStorage.getItem(SKIN_STATE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[userId] = state;
    localStorage.setItem(SKIN_STATE_KEY, JSON.stringify(all));
  } catch {
    // ignora quota / modo privado
  }
}

function updateStoredProfileSkin(profilePatch) {
  const stored = getStoredSession();
  if (!stored?.profile) return;
  saveSession(stored.token, { ...stored.profile, ...profilePatch });
}

export function loadSkinState(userId, profile = {}) {
  const local = readStoredSkinState(userId);
  const mergedProfile = {
    ...profile,
    registration_color: profile.registration_color || local?.registration_color || profile.character_color,
    active_skin_id: profile.active_skin_id || local?.active_skin_id || DEFAULT_SKIN_ID,
    unlocked_skins: profile.unlocked_skins || local?.unlocked_skins || [DEFAULT_SKIN_ID],
  };

  return normalizeSkinState(mergedProfile);
}

export async function saveActiveSkin(userId, token, activeSkinId, profile = {}) {
  const current = loadSkinState(userId, profile);
  const nextSkinId = String(activeSkinId || DEFAULT_SKIN_ID);

  if (!current.unlockedSkins.includes(nextSkinId)) {
    return current;
  }

  const appearance = resolveSkinAppearance(nextSkinId, current.registrationColor);
  const nextState = normalizeSkinState({
    registration_color: current.registrationColor,
    active_skin_id: nextSkinId,
    unlocked_skins: current.unlockedSkins,
    character_color: appearance.color,
  });

  writeStoredSkinState(userId, {
    registration_color: nextState.registrationColor,
    active_skin_id: nextState.activeSkinId,
    unlocked_skins: nextState.unlockedSkins,
    character_color: nextState.characterColor,
    skin_style: nextState.skinStyle,
  });

  if (token) {
    try {
      const data = await apiSaveCharacterSkin(token, nextSkinId);
      const profilePatch = data.profile || {};
      const saved = normalizeSkinState({
        registration_color: profilePatch.registration_color || nextState.registrationColor,
        active_skin_id: profilePatch.active_skin_id || nextState.activeSkinId,
        unlocked_skins: normalizeUnlockedSkins(profilePatch.unlocked_skins || nextState.unlockedSkins),
        character_color: profilePatch.character_color || nextState.characterColor,
      });

      writeStoredSkinState(userId, {
        registration_color: saved.registrationColor,
        active_skin_id: saved.activeSkinId,
        unlocked_skins: saved.unlockedSkins,
        character_color: saved.characterColor,
        skin_style: saved.skinStyle,
      });
      updateStoredProfileSkin({
        registration_color: saved.registrationColor,
        active_skin_id: saved.activeSkinId,
        unlocked_skins: saved.unlockedSkins,
        character_color: saved.characterColor,
      });
      return saved;
    } catch {
      updateStoredProfileSkin({
        registration_color: nextState.registrationColor,
        active_skin_id: nextState.activeSkinId,
        unlocked_skins: nextState.unlockedSkins,
        character_color: nextState.characterColor,
      });
    }
  }

  return nextState;
}
