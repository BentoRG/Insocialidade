/**
 * Sincronização em tempo real via WebSocket (presença, chat e usuários online).
 */

const SEND_MS = 33;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 8000;

export function createRealtimePresence({
  url,
  token,
  mapId,
  profile,
  spawn,
  onPlayers,
  onUsers,
  onStatus,
  onChatOpened,
  onChatPending,
  onChatMessage,
  onChatError,
}) {
  let ws = null;
  let stopped = false;
  let joined = false;
  let reconnectDelay = RECONNECT_MIN_MS;
  let reconnectTimer = null;
  let lastSend = 0;
  let lastPayload = '';

  /** @type {Map<string, object>} */
  const players = new Map();

  function emitPlayers() {
    onPlayers?.([...players.values()]);
  }

  function setStatus(message) {
    onStatus?.(message);
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function handleMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'world' && Array.isArray(msg.players)) {
      players.clear();
      for (const player of msg.players) {
        if (player?.id) players.set(player.id, player);
      }
      joined = true;
      emitPlayers();
      setStatus('');
      return;
    }

    if (msg.type === 'users' && Array.isArray(msg.users)) {
      onUsers?.(msg.users);
      return;
    }

    if (msg.type === 'join' && msg.player?.id) {
      players.set(msg.player.id, msg.player);
      emitPlayers();
      return;
    }

    if (msg.type === 'leave' && msg.id) {
      players.delete(msg.id);
      emitPlayers();
      return;
    }

    if (msg.type === 'move' && msg.id) {
      const existing = players.get(msg.id) || { id: msg.id };
      players.set(msg.id, {
        ...existing,
        x: msg.x,
        y: msg.y,
        facing: msg.facing,
        moving: msg.moving,
        lastSeen: msg.t,
      });
      emitPlayers();
      return;
    }

    if (msg.type === 'chat_opened') {
      onChatOpened?.(msg);
      return;
    }

    if (msg.type === 'chat_pending') {
      onChatPending?.(msg);
      return;
    }

    if (msg.type === 'chat_message') {
      onChatMessage?.(msg);
      return;
    }

    if (msg.type === 'chat_error') {
      onChatError?.(msg.error || 'Erro no chat.');
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 1.6);
    }, reconnectDelay);
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener('open', () => {
      reconnectDelay = RECONNECT_MIN_MS;
      joined = false;
      send({
        type: 'join',
        token,
        map: mapId,
        username: profile.username,
        character_color: profile.character_color,
        x: spawn.x,
        y: spawn.y,
        facing: spawn.facing || 'down',
        moving: false,
      });
    });

    ws.addEventListener('message', handleMessage);

    ws.addEventListener('close', () => {
      joined = false;
      if (!stopped) {
        setStatus('Reconectando…');
        scheduleReconnect();
      }
    });

    ws.addEventListener('error', () => {
      ws?.close();
    });
  }

  function sendMove({ x, y, facing, moving }) {
    if (!joined) return;
    const now = performance.now();
    const payload = `${x}|${y}|${facing}|${moving ? 1 : 0}`;
    const due = now - lastSend >= SEND_MS;
    const changed = payload !== lastPayload;
    if (!due && !(changed && !moving)) return;

    lastSend = now;
    lastPayload = payload;
    send({ type: 'move', x, y, facing, moving: Boolean(moving) });
  }

  function openChat({ peerId, x, y, tileWidth, tileHeight }) {
    if (!joined) return;
    send({ type: 'chat_request', peerId, x, y, tileWidth, tileHeight });
  }

  function sendChat({ peerId, text, x, y, tileWidth, tileHeight }) {
    if (!joined) return;
    send({ type: 'chat_send', peerId, text, x, y, tileWidth, tileHeight });
  }

  connect();

  return {
    sendMove,
    openChat,
    sendChat,
    destroy() {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      players.clear();
      ws?.close();
      ws = null;
    },
  };
}
