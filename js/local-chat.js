/**
 * Chat local — conversa por aceite mútuo a até 2 tiles de outro jogador.
 */

import { findNearbyPlayers } from './proximity.js';

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
  let activePeerOutOfRange = false;
  const pendingPeerIds = new Set();
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

  function renderNearbyPrompts(players) {
    if (!nearbyEl || activePeer) return;
    nearbyEl.replaceChildren();
    delete nearbyEl.dataset.idleHint;

    for (const player of players) {
      const peerId = peerIdKey(player.id);
      const pending = pendingPeerIds.has(peerId);
      const row = document.createElement('div');
      row.className =
        'game-local-chat__prompt' +
        (pending ? ' game-local-chat__prompt--pending' : '');

      const name = document.createElement('span');
      name.className = 'game-local-chat__prompt-name';
      name.textContent = player.username || 'Jogador';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--sm game-local-chat__start';
      button.disabled = pending;
      button.textContent = pending ? 'Aguardando aceite...' : 'Conversar';
      button.addEventListener('click', () => requestChat(player));

      row.append(name, button);
      nearbyEl.appendChild(row);
    }
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
    activePeerOutOfRange = false;
    pendingPeerIds.delete(peerIdKey(peer.id));
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
    activePeerOutOfRange = false;
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

  function requestChat(player) {
    const peerId = peerIdKey(player.id);
    if (pendingPeerIds.has(peerId)) return;
    if (activePeer && peerIdKey(activePeer.id) === peerId) return;

    openingPeerId = peerId;
    pendingPeerIds.add(peerId);

    getRealtime()?.openChat({ peerId, ...positionPayload() });
  }

  function resolvePeer(peerId, peer = null) {
    const remote = getRemotePlayers().find(
      (player) => peerIdKey(player.id) === peerIdKey(peerId)
    );

    return {
      id: peer?.id || remote?.id || peerId,
      username: peer?.username || remote?.username || 'Jogador',
      color:
        peer?.character_color ||
        peer?.color ||
        remote?.character_color ||
        remote?.color,
    };
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

    for (const id of pendingPeerIds) {
      if (!nearbyIds.has(id)) pendingPeerIds.delete(id);
    }

    for (const id of dismissedPeerIds) {
      if (!nearbyIds.has(id)) dismissedPeerIds.delete(id);
    }

    if (activePeer) {
      const inRange = nearbyIds.has(peerIdKey(activePeer.id));
      setSendEnabled(inRange);
      if (!inRange) {
        if (!activePeerOutOfRange) {
          appendSystem('Você se afastou — aproxime-se para responder.');
        }
        activePeerOutOfRange = true;
      } else {
        activePeerOutOfRange = false;
      }
      return;
    }

    const candidates = nearby.filter(
      (player) => !dismissedPeerIds.has(peerIdKey(player.id))
    );
    if (candidates.length) renderNearbyPrompts(candidates);
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
      pendingPeerIds.delete(peerIdKey(msg.peer.id));
      ingestMessages(msg.messages, msg.peer.username);
    },
    handleChatMessage(msg) {
      const peerId = peerIdKey(msg.peerId);
      if (!peerId) return;

      if (peerIdKey(activePeer?.id) !== peerId) {
        openingPeerId = null;
        pendingPeerIds.delete(peerId);
        dismissedPeerIds.delete(peerId);
        showActive(resolvePeer(peerId, msg.peer));
      }

      ingestMessages([msg.message], activePeer.username);
    },
    handleChatError(error) {
      openingPeerId = null;
      pendingPeerIds.clear();
      if (String(error).includes('fora_de_alcance')) {
        if (activePeer) {
          setSendEnabled(false);
          if (!activePeerOutOfRange) {
            appendSystem('Você se afastou — aproxime-se para responder.');
          }
          activePeerOutOfRange = true;
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
