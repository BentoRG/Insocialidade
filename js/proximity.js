/**
 * Proximidade entre jogadores em tiles do mapa.
 */

export const LOCAL_CHAT_TILE_RADIUS = 2;

export function tileDistance(ax, ay, bx, by, tileWidth, tileHeight) {
  const ac = Math.floor(ax / tileWidth);
  const ar = Math.floor(ay / tileHeight);
  const bc = Math.floor(bx / tileWidth);
  const br = Math.floor(by / tileHeight);
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
}

export function isWithinTileRadius(
  ax,
  ay,
  bx,
  by,
  tileWidth,
  tileHeight,
  radius = LOCAL_CHAT_TILE_RADIUS
) {
  return tileDistance(ax, ay, bx, by, tileWidth, tileHeight) <= radius;
}

export function findNearbyPlayers(
  localPlayer,
  remotePlayers,
  tileWidth,
  tileHeight,
  radius = LOCAL_CHAT_TILE_RADIUS
) {
  const nearby = [];

  for (const remote of remotePlayers) {
    if (
      isWithinTileRadius(
        localPlayer.x,
        localPlayer.y,
        remote.x,
        remote.y,
        tileWidth,
        tileHeight,
        radius
      )
    ) {
      nearby.push(remote);
    }
  }

  return nearby;
}

export function pickClosestPlayer(localPlayer, players) {
  if (!players.length) return null;

  let closest = players[0];
  let closestDist = Math.hypot(localPlayer.x - closest.x, localPlayer.y - closest.y);

  for (let i = 1; i < players.length; i++) {
    const player = players[i];
    const dist = Math.hypot(localPlayer.x - player.x, localPlayer.y - player.y);
    if (dist < closestDist) {
      closest = player;
      closestDist = dist;
    }
  }

  return closest;
}
