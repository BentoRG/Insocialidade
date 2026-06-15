/**
 * Chat local — conversa por aceite mútuo a até 2 tiles de outro jogador.
 */

import { findNearbyPlayers } from './proximity.js';

export function createLocalChat({
  nearbyEl,
  activeEl,
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
  let nearbyPromptSignature = '';
  let pendingReply = null;
  const pendingPeerIds = new Set();
  const incomingPeerIds = new Set();
  const dismissedPeerIds = new Set();
  const seenMessageIds = new Set();
  const messagesById = new Map();
  const submitBtn = formEl?.querySelector('button[type="submit"]');

  function peerIdKey(id) {
    return String(id ?? '');
  }

  function isSelf(from) {
    return peerIdKey(from) === peerIdKey(localUserId);
  }

  function messageIdKey(id) {
    return String(id ?? '');
  }

  function messageAuthorName(from, fallback) {
    return isSelf(from) ? 'Você' : fallback || activePeer?.username || 'Jogador';
  }

  function truncateMessage(text, maxLength = 90) {
    const value = String(text || '').trim();
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
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

    nearbyPromptSignature = '';
    nearbyEl.dataset.idleHint = text;
    nearbyEl.replaceChildren();
    const hint = document.createElement('p');
    hint.className = 'game-local-chat__hint';
    hint.textContent = text;
    nearbyEl.appendChild(hint);
  }

  function renderNearbyPrompts(players) {
    if (!nearbyEl || activePeer) return;

    const signature = players
      .map((player) => {
        const peerId = peerIdKey(player.id);
        const pending = pendingPeerIds.has(peerId) ? 'pending' : '';
        const incoming = incomingPeerIds.has(peerId) ? 'incoming' : '';
        return `${peerId}:${player.username || ''}:${pending}:${incoming}`;
      })
      .join('|');
    if (nearbyPromptSignature === signature) return;

    nearbyPromptSignature = signature;
    nearbyEl.replaceChildren();
    delete nearbyEl.dataset.idleHint;

    for (const player of players) {
      const peerId = peerIdKey(player.id);
      const pending = pendingPeerIds.has(peerId);
      const incoming = incomingPeerIds.has(peerId);
      const row = document.createElement('div');
      row.className =
        'game-local-chat__prompt' +
        (pending || incoming ? ' game-local-chat__prompt--pending' : '');

      const name = document.createElement('span');
      name.className = 'game-local-chat__prompt-name';
      name.textContent = player.username || 'Jogador';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn--sm game-local-chat__start';
      button.disabled = pending;
      button.textContent = pending
        ? 'Aguardando aceite...'
        : incoming
          ? 'Autorizar'
          : 'Conversar';
      button.addEventListener('click', () => {
        if (incoming) acceptChat(player);
        else requestChat(player);
      });

      row.append(name, button);
      if (pending || incoming) {
        const status = document.createElement('p');
        status.className = 'game-local-chat__prompt-status';
        status.textContent = pending
          ? 'O jogo está aguardando a autorização do outro jogador próximo para iniciar o chat.'
          : `${player.username || 'Jogador'} quer conversar. Clique em Autorizar para iniciar o chat.`;
        row.appendChild(status);
      }
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
        id: msg.id,
        from: msg.from,
        text: msg.text,
        username: isSelf(msg.from) ? 'Você' : peerUsername || activePeer?.username,
        replyTo: msg.replyTo,
      });
    }
  }

  function renderReplyDraft() {
    activeEl?.querySelector('.game-local-chat__reply-draft')?.remove();
    if (!pendingReply || !formEl) return;

    const draft = document.createElement('div');
    draft.className = 'game-local-chat__reply-draft';

    const content = document.createElement('span');
    content.className = 'game-local-chat__reply-draft-text';
    content.textContent = `Respondendo ${pendingReply.authorName}: ${truncateMessage(pendingReply.text, 72)}`;

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'game-local-chat__reply-cancel';
    cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => {
      pendingReply = null;
      renderReplyDraft();
      inputEl?.focus();
    });

    draft.append(content, cancel);
    formEl.before(draft);
  }

  function setPendingReply(message) {
    pendingReply = {
      id: message.id,
      from: message.from,
      authorName: message.authorName,
      text: message.text,
    };
    renderReplyDraft();
    inputEl?.focus();
  }

  function resolvedReply(replyTo, peerUsername) {
    const replyId = messageIdKey(replyTo?.id);
    if (!replyId) return null;

    const stored = messagesById.get(replyId);
    const from = replyTo.from || stored?.from;
    const text = replyTo.text || stored?.text || '';
    if (!from || !text) return null;

    return {
      id: replyId,
      from,
      authorName: messageAuthorName(from, peerUsername),
      text,
    };
  }

  function appendMessage({ id, from, text, username, replyTo }) {
    if (!messagesEl) return;

    const messageId = messageIdKey(id);
    const authorName = messageAuthorName(from, username);
    const message = { id: messageId, from, authorName, text };
    const reply = resolvedReply(replyTo, username);

    if (messageId) messagesById.set(messageId, message);

    const row = document.createElement('div');
    row.className =
      'game-local-chat__msg' + (isSelf(from) ? ' game-local-chat__msg--self' : '');
    if (messageId) row.dataset.messageId = messageId;

    if (reply) {
      const replyPreview = document.createElement('div');
      replyPreview.className = 'game-local-chat__reply-preview';
      replyPreview.textContent = `${reply.authorName}: ${truncateMessage(reply.text)}`;
      row.appendChild(replyPreview);
    }

    const author = document.createElement('span');
    author.className = 'game-local-chat__msg-author';
    author.textContent = authorName;

    const body = document.createElement('span');
    body.className = 'game-local-chat__msg-text';
    body.textContent = text;

    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'game-local-chat__reply';
    replyButton.textContent = 'Responder';
    replyButton.setAttribute('aria-label', `Responder mensagem de ${authorName}`);
    replyButton.addEventListener('click', () => setPendingReply(message));

    row.append(author, body, replyButton);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showActive(peer) {
    activePeer = peer;
    idleHint = '';
    activePeerOutOfRange = false;
    pendingPeerIds.delete(peerIdKey(peer.id));
    seenMessageIds.clear();
    messagesById.clear();
    pendingReply = null;
    lastMessageId = 0;
    if (nearbyEl) {
      nearbyEl.hidden = true;
      nearbyEl.replaceChildren();
      delete nearbyEl.dataset.idleHint;
      nearbyPromptSignature = '';
    }
    if (activeEl) activeEl.hidden = false;
    if (messagesEl) messagesEl.replaceChildren();
    setSendEnabled(isPeerInRange());
    inputEl?.focus();
  }

  function hideActive() {
    activePeer = null;
    activePeerOutOfRange = false;
    lastMessageId = 0;
    seenMessageIds.clear();
    messagesById.clear();
    pendingReply = null;
    renderReplyDraft();
    setSendEnabled(false);
    if (activeEl) activeEl.hidden = true;
    if (messagesEl) messagesEl.replaceChildren();
    if (nearbyEl) nearbyEl.hidden = false;
    nearbyPromptSignature = '';
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

    const sent = getRealtime()?.openChat({ peerId, ...positionPayload() });
    if (!sent) {
      openingPeerId = null;
      showIdleHint('Conexão em tempo real ainda não está pronta. Tente novamente.');
      return;
    }

    pendingPeerIds.add(peerId);
    incomingPeerIds.delete(peerId);
    syncProximity();
  }

  function acceptChat(player) {
    const peerId = peerIdKey(player.id);
    if (!incomingPeerIds.has(peerId) || pendingPeerIds.has(peerId)) return;
    if (activePeer && peerIdKey(activePeer.id) === peerId) return;

    openingPeerId = peerId;

    const sent = getRealtime()?.acceptChat({ peerId, ...positionPayload() });
    if (!sent) {
      openingPeerId = null;
      showIdleHint('Conexão em tempo real ainda não está pronta. Tente novamente.');
      return;
    }

    incomingPeerIds.delete(peerId);
    pendingPeerIds.add(peerId);
    syncProximity();
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

    const sent = getRealtime()?.sendChat({
      peerId: activePeer.id,
      text: trimmed,
      replyTo: pendingReply ? { id: pendingReply.id } : null,
      ...positionPayload(),
    });
    if (sent) {
      pendingReply = null;
      renderReplyDraft();
    }
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

    for (const id of incomingPeerIds) {
      if (!nearbyIds.has(id)) incomingPeerIds.delete(id);
    }

    for (const id of dismissedPeerIds) {
      if (!nearbyIds.has(id)) dismissedPeerIds.delete(id);
    }

    if (activePeer) {
      const inRange = nearbyIds.has(peerIdKey(activePeer.id));
      setSendEnabled(inRange);
      if (!inRange) {
        closeChat();
        showIdleHint('Chat encerrado porque vocês se afastaram.');
        return;
      }
      activePeerOutOfRange = false;
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
      incomingPeerIds.delete(peerIdKey(msg.peer.id));
      ingestMessages(msg.messages, msg.peer.username);
    },
    handleChatPending(msg) {
      openingPeerId = null;
      const peerId = peerIdKey(msg?.peerId || msg?.peer?.id);
      if (!peerId) return;

      pendingPeerIds.add(peerId);
      incomingPeerIds.delete(peerId);
      syncProximity();
    },
    handleChatRequest(msg) {
      const peerId = peerIdKey(msg?.peerId || msg?.peer?.id);
      if (!peerId || peerIdKey(activePeer?.id) === peerId) return;

      pendingPeerIds.delete(peerId);
      incomingPeerIds.add(peerId);
      syncProximity();
    },
    handleChatMessage(msg) {
      const peerId = peerIdKey(msg.peerId);
      if (!peerId) return;

      if (peerIdKey(activePeer?.id) !== peerId) {
        openingPeerId = null;
        pendingPeerIds.delete(peerId);
        incomingPeerIds.delete(peerId);
        dismissedPeerIds.delete(peerId);
        showActive(resolvePeer(peerId, msg.peer));
      }

      ingestMessages([msg.message], activePeer.username);
    },
    handleChatError(error) {
      openingPeerId = null;
      pendingPeerIds.clear();
      incomingPeerIds.clear();
      if (String(error).includes('fora_de_alcance')) {
        if (activePeer) {
          closeChat();
          showIdleHint('Chat encerrado porque vocês se afastaram.');
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
