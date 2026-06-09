/**
 * Chat local — abre automaticamente a até 2 tiles de outro jogador.
 */

import { findNearbyPlayers, pickClosestPlayer } from './proximity.js';

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
  getRealtime,
}) {
  let activePeer = null;
  let lastMessageId = 0;
  let openingPeerId = null;
  let idleHint = '';
  const dismissedPeerIds = new Set();
  const seenMessageIds = new Set();
  const submitBtn = formEl?.querySelector('button[type="submit"]');

  function peerIdKey(id) {
    return String(id ?? '');
  }

  function isSelf(from) {
    return peerIdKey(from) === peerIdKey(localUserId);
  }

  function positionPayload() {
    const local = getLocalPlayer();
    const { tileWidth, tileHeight } = getTileSize();
    return {
      x: local.x,
      y: local.y,
      tileWidth,
      tileHeight,
    };
  }

  function isPeerInRange() {
    if (!activePeer) return false;

    const local = getLocalPlayer();
    const remotes = getRemotePlayers();
    const { tileWidth, tileHeight } = getTileSize();
    return findNearbyPlayers(local, remotes, tileWidth, tileHeight).some(
      (player) => peerIdKey(player.id) === peerIdKey(activePeer.id)
    );
  }

  function setSendEnabled(enabled) {
    if (inputEl) {
      inputEl.disabled = !enabled;
      inputEl.placeholder = enabled ? 'Mensagem…' : 'Aproxime-se para enviar…';
    }
    if (submitBtn) submitBtn.disabled = !enabled;
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

  function ingestMessages(messages, peerUsername) {
    if (!messages?.length) return;

    for (const msg of messages) {
      if (!msg?.id || seenMessageIds.has(msg.id)) continue;
      seenMessageIds.add(msg.id);
      lastMessageId = Math.max(lastMessageId, msg.id);
      appendMessage({
        from: msg.from,
        text: msg.text,
        username: isSelf(msg.from) ? 'Você' : peerUsername || activePeer?.username,
      });
    }
  }

  function appendMessage({ from, text, username }) {
    if (!messagesEl) return;

    const row = document.createElement('div');
    row.className =
      'game-local-chat__msg' + (isSelf(from) ? ' game-local-chat__msg--self' : '');

    const author = document.createElement('span');
    author.className = 'game-local-chat__msg-author';
    author.textContent = isSelf(from) ? 'Você' : username || 'Jogador';

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
    seenMessageIds.clear();
    lastMessageId = 0;
    if (nearbyEl) {
      nearbyEl.hidden = true;
      nearbyEl.replaceChildren();
      delete nearbyEl.dataset.idleHint;
    }
    if (activeEl) activeEl.hidden = false;
    if (peerNameEl) peerNameEl.textContent = peer.username || 'Jogador';
    if (messagesEl) messagesEl.replaceChildren();
    setSendEnabled(isPeerInRange());
    inputEl?.focus();
  }

  function hideActive() {
    activePeer = null;
    lastMessageId = 0;
    seenMessageIds.clear();
    setSendEnabled(false);
    if (activeEl) activeEl.hidden = true;
    if (messagesEl) messagesEl.replaceChildren();
    if (nearbyEl) nearbyEl.hidden = false;
    renderIdle();
  }

  function appendSystem(text) {
    if (!messagesEl) return;
    const row = document.createElement('p');
    row.className = 'game-local-chat__system';
    row.textContent = text;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function openChat(player) {
    const peerId = peerIdKey(player.id);
    if (openingPeerId === peerId) return;
    if (activePeer && peerIdKey(activePeer.id) === peerId) return;

    openingPeerId = peerId;

    showActive({
      id: player.id,
      username: player.username || 'Jogador',
      color: player.color || player.character_color,
    });

    getRealtime()?.openChat({ peerId, ...positionPayload() });
  }

  function closeChat() {
    hideActive();
  }

  function sendMessage(text) {
    if (!activePeer) return;
    if (!isPeerInRange()) {
      appendSystem('Aproxime-se do jogador para enviar.');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    getRealtime()?.sendChat({
      peerId: activePeer.id,
      text: trimmed,
      ...positionPayload(),
    });
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
      const inRange = nearbyIds.has(peerIdKey(activePeer.id));
      setSendEnabled(inRange);
      if (!inRange) {
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
    if (closest) openChat(closest);
    else renderIdle();
  }

  formEl?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = inputEl?.value || '';
    if (inputEl) inputEl.value = '';
    sendMessage(text);
  });

  setSendEnabled(false);

  return {
    update() {
      syncProximity();
    },
    handleChatOpened(msg) {
      openingPeerId = null;
      if (!msg?.peer) {
        dismissedPeerIds.add(peerIdKey(activePeer?.id));
        closeChat();
        showIdleHint('Não foi possível abrir o chat.');
        return;
      }

      showActive({
        id: msg.peer.id,
        username: msg.peer.username,
        color: msg.peer.character_color,
      });
      ingestMessages(msg.messages, msg.peer.username);
    },
    handleChatMessage(msg) {
      if (!activePeer || peerIdKey(msg.peerId) !== peerIdKey(activePeer.id)) return;
      ingestMessages([msg.message], activePeer.username);
    },
    handleChatError(error) {
      openingPeerId = null;
      if (String(error).includes('fora_de_alcance')) {
        if (activePeer) {
          appendSystem('Você se afastou — chat encerrado.');
          closeChat();
        }
        return;
      }

      if (activePeer) {
        dismissedPeerIds.add(peerIdKey(activePeer.id));
        closeChat();
      }
      showIdleHint(error || 'Erro no chat.');
    },
    destroy() {
      closeChat();
    },
  };
}
