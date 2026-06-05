/**
 * Chat local — abre automaticamente a até 2 tiles de outro jogador.
 */

import { CONFIG } from './config.js';
import { findNearbyPlayers, pickClosestPlayer } from './proximity.js';
import { apiLocalChatOpen, apiLocalChatSend, apiLocalChatPoll } from './api.js';

export function createLocalChat({
  nearbyEl,
  activeEl,
  peerNameEl,
  messagesEl,
  formEl,
  inputEl,
  getLocalPlayer,
  getRemotePlayers,
  getTileSize,
  localUserId,
  getToken,
}) {
  let activePeer = null;
  let lastMessageId = 0;
  let pollTimer = null;
  let pollStopped = false;
  let openingPeerId = null;
  let idleHint = '';
  const dismissedPeerIds = new Set();

  function peerIdKey(id) {
    return String(id ?? '');
  }

  function tilePayload() {
    const { tileWidth, tileHeight } = getTileSize();
    return { tileWidth, tileHeight };
  }

  function renderIdle() {
    if (!nearbyEl || activePeer) return;

    const text =
      idleHint || 'Aproxime-se de outro jogador (até 2 tiles) para conversar.';
    if (nearbyEl.dataset.idleHint === text) return;

    nearbyEl.dataset.idleHint = text;
    nearbyEl.replaceChildren();
    const hint = document.createElement('p');
    hint.className = 'game-local-chat__hint';
    hint.textContent = text;
    nearbyEl.appendChild(hint);
  }

  function showIdleHint(text) {
    idleHint = text;
    renderIdle();
    if (text) {
      setTimeout(() => {
        if (idleHint === text) {
          idleHint = '';
          renderIdle();
        }
      }, 4000);
    }
  }

  function appendMessage({ from, text, username }) {
    if (!messagesEl) return;

    const row = document.createElement('div');
    row.className =
      'game-local-chat__msg' +
      (from === localUserId ? ' game-local-chat__msg--self' : '');

    const author = document.createElement('span');
    author.className = 'game-local-chat__msg-author';
    author.textContent = from === localUserId ? 'Você' : username || 'Jogador';

    const body = document.createElement('span');
    body.className = 'game-local-chat__msg-text';
    body.textContent = text;

    row.append(author, body);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showActive(peer) {
    activePeer = peer;
    idleHint = '';
    if (nearbyEl) {
      nearbyEl.hidden = true;
      nearbyEl.replaceChildren();
      delete nearbyEl.dataset.idleHint;
    }
    if (activeEl) activeEl.hidden = false;
    if (peerNameEl) peerNameEl.textContent = peer.username || 'Jogador';
    if (messagesEl) messagesEl.replaceChildren();
    lastMessageId = 0;
    inputEl?.focus();
  }

  function hideActive() {
    activePeer = null;
    lastMessageId = 0;
    if (activeEl) activeEl.hidden = true;
    if (messagesEl) messagesEl.replaceChildren();
    if (nearbyEl) nearbyEl.hidden = false;
    renderIdle();
  }

  function stopPoll() {
    pollStopped = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  async function pollMessages() {
    if (pollStopped || !activePeer) return;

    const token = getToken();
    if (!token) return;

    try {
      const data = await apiLocalChatPoll(token, {
        peerId: activePeer.id,
        after: lastMessageId,
        ...tilePayload(),
      });

      if (data.peer?.username && peerNameEl) {
        peerNameEl.textContent = data.peer.username;
      }

      for (const msg of data.messages || []) {
        lastMessageId = Math.max(lastMessageId, msg.id);
        appendMessage({
          from: msg.from,
          text: msg.text,
          username: msg.from === localUserId ? 'Você' : data.peer?.username,
        });
      }
    } catch (err) {
      if (String(err.message || err).includes('fora_de_alcance')) {
        appendSystem('Você se afastou — chat encerrado.');
        closeChat();
        return;
      }
    }

    if (!pollStopped && activePeer) {
      pollTimer = setTimeout(pollMessages, CONFIG.LOCAL_CHAT_POLL_MS);
    }
  }

  function startPoll() {
    stopPoll();
    pollStopped = false;
    void pollMessages();
  }

  function appendSystem(text) {
    if (!messagesEl) return;
    const row = document.createElement('p');
    row.className = 'game-local-chat__system';
    row.textContent = text;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function openChat(player) {
    const peerId = peerIdKey(player.id);
    const token = getToken();
    if (!token || openingPeerId === peerId) return;
    if (activePeer && peerIdKey(activePeer.id) === peerId) return;

    openingPeerId = peerId;

    showActive({
      id: player.id,
      username: player.username || 'Jogador',
      color: player.color || player.character_color,
    });

    try {
      const data = await apiLocalChatOpen(token, {
        peerId,
        ...tilePayload(),
      });
      showActive({
        id: data.peer.id,
        username: data.peer.username,
        color: data.peer.character_color,
      });
      startPoll();
    } catch (err) {
      dismissedPeerIds.add(peerId);
      closeChat();
      showIdleHint(err.message || 'Não foi possível abrir o chat.');
    } finally {
      openingPeerId = null;
    }
  }

  function closeChat() {
    stopPoll();
    hideActive();
  }

  async function sendMessage(text) {
    if (!activePeer) return;
    const token = getToken();
    if (!token) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      const data = await apiLocalChatSend(token, {
        peerId: activePeer.id,
        text: trimmed,
        ...tilePayload(),
      });
      lastMessageId = Math.max(lastMessageId, data.message?.id || 0);
      appendMessage({
        from: localUserId,
        text: trimmed,
        username: 'Você',
      });
    } catch (err) {
      if (String(err.message || err).includes('fora_de_alcance')) {
        appendSystem('Você se afastou — chat encerrado.');
        closeChat();
        return;
      }
      appendSystem(err.message || 'Falha ao enviar.');
    }
  }

  function syncProximity() {
    const local = getLocalPlayer();
    const remotes = getRemotePlayers();
    const { tileWidth, tileHeight } = getTileSize();
    const nearby = findNearbyPlayers(local, remotes, tileWidth, tileHeight);
    const nearbyIds = new Set(nearby.map((player) => peerIdKey(player.id)));

    for (const id of dismissedPeerIds) {
      if (!nearbyIds.has(id)) dismissedPeerIds.delete(id);
    }

    if (activePeer) {
      if (!nearbyIds.has(peerIdKey(activePeer.id))) {
        appendSystem('Você se afastou — chat encerrado.');
        closeChat();
      }
      return;
    }

    if (openingPeerId) return;

    const candidates = nearby.filter(
      (player) => !dismissedPeerIds.has(peerIdKey(player.id))
    );
    const closest = pickClosestPlayer(local, candidates);
    if (closest) void openChat(closest);
    else renderIdle();
  }

  formEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = inputEl?.value || '';
    if (inputEl) inputEl.value = '';
    void sendMessage(text);
  });

  return {
    update() {
      syncProximity();
    },
    destroy() {
      stopPoll();
      closeChat();
    },
  };
}
