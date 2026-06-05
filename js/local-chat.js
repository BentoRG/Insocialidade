/**
 * Chat local — proximidade de 1 tile e mensagens em tempo real (polling).
 */

import { CONFIG } from './config.js';
import { findNearbyPlayers } from './proximity.js';
import { apiLocalChatOpen, apiLocalChatSend, apiLocalChatPoll } from './api.js';

export function createLocalChat({
  nearbyEl,
  activeEl,
  peerNameEl,
  messagesEl,
  formEl,
  inputEl,
  closeBtn,
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
  let lastNearbySignature = null;

  function peerIdKey(id) {
    return String(id ?? '');
  }

  function invalidateNearby() {
    lastNearbySignature = null;
  }

  function tilePayload() {
    const { tileWidth, tileHeight } = getTileSize();
    return { tileWidth, tileHeight };
  }

  function renderNearby() {
    if (!nearbyEl) return;

    const local = getLocalPlayer();
    const remotes = getRemotePlayers();
    const { tileWidth, tileHeight } = getTileSize();
    const nearby = findNearbyPlayers(local, remotes, tileWidth, tileHeight);
    const visible = nearby.filter(
      (player) => peerIdKey(player.id) !== peerIdKey(activePeer?.id)
    );
    const signature = visible.length
      ? visible
          .map((player) => `${peerIdKey(player.id)}:${player.username || ''}`)
          .sort()
          .join('|')
      : '__empty__';

    if (signature === lastNearbySignature) return;
    lastNearbySignature = signature;

    nearbyEl.replaceChildren();

    if (!visible.length) {
      const hint = document.createElement('p');
      hint.className = 'game-local-chat__hint';
      hint.textContent = 'Ninguém por perto no momento.';
      nearbyEl.appendChild(hint);
      return;
    }

    for (const player of visible) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--sm game-local-chat__start';
      btn.textContent = `Conversar com ${player.username}`;
      btn.dataset.peerId = peerIdKey(player.id);
      btn.dataset.peerUsername = player.username || 'Jogador';
      nearbyEl.appendChild(btn);
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
    invalidateNearby();
    if (activeEl) activeEl.hidden = false;
    if (peerNameEl) peerNameEl.textContent = peer.username || 'Jogador';
    if (messagesEl) messagesEl.replaceChildren();
    lastMessageId = 0;
    inputEl?.focus();
    renderNearby();
  }

  function hideActive() {
    activePeer = null;
    lastMessageId = 0;
    invalidateNearby();
    if (activeEl) activeEl.hidden = true;
    if (messagesEl) messagesEl.replaceChildren();
    renderNearby();
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
    const token = getToken();
    if (!token) return;

    showActive({
      id: player.id,
      username: player.username || 'Jogador',
      color: player.color,
    });

    try {
      const data = await apiLocalChatOpen(token, {
        peerId: peerIdKey(player.id),
        ...tilePayload(),
      });
      showActive({
        id: data.peer.id,
        username: data.peer.username,
        color: data.peer.character_color,
      });
      appendSystem(`Chat aberto com ${data.peer.username}.`);
      startPoll();
    } catch (err) {
      closeChat();
      if (nearbyEl) {
        const errHint = document.createElement('p');
        errHint.className = 'game-local-chat__hint';
        errHint.textContent = err.message || 'Não foi possível abrir o chat.';
        nearbyEl.prepend(errHint);
        setTimeout(() => errHint.remove(), 4000);
      }
      renderNearby();
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

  nearbyEl?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-peer-id]');
    if (!btn || !nearbyEl.contains(btn)) return;
    void openChat({
      id: btn.dataset.peerId,
      username: btn.dataset.peerUsername,
    });
  });

  closeBtn?.addEventListener('click', () => closeChat());

  formEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = inputEl?.value || '';
    if (inputEl) inputEl.value = '';
    void sendMessage(text);
  });

  return {
    update() {
      renderNearby();
      if (activePeer) {
        const local = getLocalPlayer();
        const remotes = getRemotePlayers();
        const { tileWidth, tileHeight } = getTileSize();
        const stillNear = findNearbyPlayers(local, remotes, tileWidth, tileHeight).some(
          (p) => peerIdKey(p.id) === peerIdKey(activePeer.id)
        );
        if (!stillNear) {
          appendSystem('Você se afastou — chat encerrado.');
          closeChat();
        }
      }
    },
    destroy() {
      stopPoll();
      closeChat();
    },
  };
}
