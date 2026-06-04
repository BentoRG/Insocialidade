/**
 * Proximidade entre jogadores em tiles do mapa.
 */

export function isWithinOneTile(ax, ay, bx, by, tileWidth, tileHeight) {
  const ac = Math.floor(ax / tileWidth);
  const ar = Math.floor(ay / tileHeight);
  const bc = Math.floor(bx / tileWidth);
  const br = Math.floor(by / tileHeight);
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br)) <= 1;
}

export function findNearbyPlayers(localPlayer, remotePlayers, tileWidth, tileHeight) {
  const nearby = [];

  for (const remote of remotePlayers) {
    if (
      isWithinOneTile(
        localPlayer.x,
        localPlayer.y,
        remote.x,
        remote.y,
        tileWidth,
        tileHeight
      )
    ) {
      nearby.push(remote);
    }
  }

  return nearby;
}
