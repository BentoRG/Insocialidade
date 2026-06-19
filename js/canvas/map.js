/**
 * Loader e render de mapas Tiled (JSON / TMJ).
 */

import { collidesAt } from './collision.js?v=canvas18';
import { parseRegions, createRegionLookup } from './regions.js?v=canvas20';
import { isWithinTileRadius } from '../proximity.js';

const POCO_TILE_GID = 8;
const ARBUSTO_TILE_GID = 10;
const OUTLINE_PX = 1;

const OUTLINED_TILE_GIDS = new Set([ARBUSTO_TILE_GID]);

function buildTileMask(image, tileIndex, columns, tileWidth, tileHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = tileWidth;
  canvas.height = tileHeight;
  const ctx = canvas.getContext('2d');
  const srcX = (tileIndex % columns) * tileWidth;
  const srcY = Math.floor(tileIndex / columns) * tileHeight;
  ctx.drawImage(image, srcX, srcY, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
  const data = ctx.getImageData(0, 0, tileWidth, tileHeight).data;
  const mask = Array.from({ length: tileHeight }, () => Array(tileWidth).fill(false));

  for (let row = 0; row < tileHeight; row++) {
    for (let col = 0; col < tileWidth; col++) {
      const i = (row * tileWidth + col) * 4;
      mask[row][col] = data[i + 3] > 0;
    }
  }

  return mask;
}

function maskFilled(mask, col, row) {
  return row >= 0 && row < mask.length && col >= 0 && col < mask[0].length && mask[row][col];
}

function drawTileOutline(ctx, destX, destY, px, mask) {
  const t = OUTLINE_PX;
  const height = mask.length;
  const width = mask[0].length;

  ctx.fillStyle = '#000';
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!mask[row][col]) continue;

      const rx = destX + col * px;
      const ry = destY + row * px;

      if (!maskFilled(mask, col, row - 1)) {
        ctx.fillRect(rx - t, ry - t, px + 2 * t, t);
      }
      if (!maskFilled(mask, col, row + 1)) {
        ctx.fillRect(rx - t, ry + px, px + 2 * t, t);
      }
      if (!maskFilled(mask, col - 1, row)) {
        ctx.fillRect(rx - t, ry - t, t, px + 2 * t);
      }
      if (!maskFilled(mask, col + 1, row)) {
        ctx.fillRect(rx + px, ry - t, t, px + 2 * t);
      }
    }
  }
}

function resolveAssetPath(baseUrl, relativePath) {
  const base = new URL(baseUrl, window.location.href);
  return new URL(relativePath, base).href;
}

function getCacheVersion(url) {
  try {
    return new URL(url, window.location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function withCacheBust(url, version) {
  if (!version) return url;
  const resolved = new URL(url, window.location.href);
  resolved.searchParams.set('v', version);
  return resolved.href;
}

function getLayer(mapData, name) {
  return mapData.layers.find((layer) => layer.type === 'tilelayer' && layer.name === name);
}

function parseLayerData(layer) {
  if (Array.isArray(layer.data)) {
    return layer.data;
  }

  if (layer.encoding === 'csv' && typeof layer.data === 'string') {
    return layer.data.replace(/\n/g, ',').split(',').filter(Boolean).map(Number);
  }

  throw new Error(`Layer "${layer.name}" usa formato não suportado.`);
}

async function loadTilesetDef(mapUrl, tilesetRef) {
  if (tilesetRef.image) {
    return {
      firstgid: tilesetRef.firstgid || 1,
      tileWidth: tilesetRef.tilewidth,
      tileHeight: tilesetRef.tileheight,
      columns: tilesetRef.columns,
      imagePath: tilesetRef.image,
      imageBaseUrl: mapUrl,
    };
  }

  if (!tilesetRef.source) {
    throw new Error('Tileset inválido no mapa.');
  }

  const tsxUrl = withCacheBust(
    resolveAssetPath(mapUrl, tilesetRef.source),
    getCacheVersion(mapUrl)
  );
  const response = await fetch(tsxUrl);
  if (!response.ok) {
    throw new Error(`Falha ao carregar tileset: ${tilesetRef.source}`);
  }

  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const tilesetEl = xml.querySelector('tileset');
  const imageEl = xml.querySelector('image');

  if (!tilesetEl || !imageEl) {
    throw new Error(`Tileset XML inválido: ${tilesetRef.source}`);
  }

  return {
    firstgid: tilesetRef.firstgid || 1,
    tileWidth: Number(tilesetEl.getAttribute('tilewidth')),
    tileHeight: Number(tilesetEl.getAttribute('tileheight')),
    columns: Number(tilesetEl.getAttribute('columns')),
    imagePath: imageEl.getAttribute('source'),
    imageBaseUrl: tsxUrl,
  };
}

export function getMapId(mapUrl) {
  try {
    return new URL(mapUrl, window.location.href).pathname;
  } catch {
    return String(mapUrl || '');
  }
}

function findCentralWellTile(mapData, collisionData) {
  const mapWidth = mapData.width;
  const mapHeight = mapData.height;
  const centerCol = mapWidth / 2;
  const centerRow = mapHeight / 2;
  let best = null;
  let bestDist = Infinity;

  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const idx = row * mapWidth + col;
      if (collisionData[idx] !== POCO_TILE_GID) continue;
      const dist = (col - centerCol) ** 2 + (row - centerRow) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = { col, row };
      }
    }
  }

  return best;
}

function findArbustoTiles(mapData, collisionData) {
  const mapWidth = mapData.width;
  const mapHeight = mapData.height;
  const tiles = [];

  for (let row = 0; row < mapHeight; row++) {
    for (let col = 0; col < mapWidth; col++) {
      const idx = row * mapWidth + col;
      if (collisionData[idx] !== ARBUSTO_TILE_GID) continue;
      tiles.push({ col, row });
    }
  }

  return tiles;
}

export function isNearArbusto(map, playerX, playerY, radius = 1) {
  if (!map?.arbustoTiles?.length) return false;

  const tileWidth = map.tileWidth;
  const tileHeight = map.tileHeight;

  for (const tile of map.arbustoTiles) {
    const tileX = tile.col * tileWidth + tileWidth / 2;
    const tileY = tile.row * tileHeight + tileHeight / 2;
    if (
      isWithinTileRadius(playerX, playerY, tileX, tileY, tileWidth, tileHeight, radius)
    ) {
      return true;
    }
  }

  return false;
}

function getSpawnBesideWell(map, wellTile) {
  // Superior-esquerdo do poço (col-1, row-1); demais vizinhos só se estiver bloqueado.
  const offsets = [
    [-1, -1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [-1, 1],
    [0, 1],
    [1, 0],
    [1, 1],
  ];

  for (const [dc, dr] of offsets) {
    const col = wellTile.col + dc;
    const row = wellTile.row + dr;
    const x = col * map.tileWidth + map.tileWidth / 2;
    const y = row * map.tileHeight + map.tileHeight / 2;
    if (!collidesAt(map, x, y)) {
      return { x, y };
    }
  }

  return { x: map.spawn.x, y: map.spawn.y };
}

function getDefaultSpawn(map, mapData, collisionData) {
  const well = findCentralWellTile(mapData, collisionData);
  if (well) {
    return getSpawnBesideWell(map, well);
  }
  return { x: map.spawn.x, y: map.spawn.y };
}

function getSpawnPoint(mapData) {
  const props = mapData.properties || [];
  const spawnX = props.find((p) => p.name === 'spawnX')?.value;
  const spawnY = props.find((p) => p.name === 'spawnY')?.value;
  if (spawnX != null && spawnY != null) {
    return { x: spawnX, y: spawnY };
  }

  const spawnLayer = mapData.layers.find(
    (layer) => layer.type === 'objectgroup' && layer.name === 'spawn'
  );
  if (spawnLayer?.objects?.[0]) {
    const obj = spawnLayer.objects[0];
    return { x: obj.x + (obj.width || 0) / 2, y: obj.y + (obj.height || 0) / 2 };
  }

  return {
    x: (mapData.width * mapData.tilewidth) / 2,
    y: (mapData.height * mapData.tileheight) / 2,
  };
}

export async function loadMap(mapUrl) {
  const mapFetchUrl = mapUrl.startsWith('http')
    ? mapUrl
    : new URL(mapUrl, window.location.href).href;
  const cacheVersion = getCacheVersion(mapFetchUrl);
  const response = await fetch(mapFetchUrl);
  if (!response.ok) {
    throw new Error(`Falha ao carregar mapa: ${mapUrl}`);
  }

  const mapData = await response.json();
  const tilesetDef = await loadTilesetDef(mapFetchUrl, mapData.tilesets[0]);
  const imageUrl = withCacheBust(
    resolveAssetPath(tilesetDef.imageBaseUrl, tilesetDef.imagePath),
    cacheVersion
  );

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar tileset: ${imageUrl}`));
    img.src = imageUrl;
  });

  const groundLayer = getLayer(mapData, 'ground');
  const collisionLayer = getLayer(mapData, 'collision');

  if (!groundLayer) {
    throw new Error('Mapa precisa de uma layer "ground".');
  }

  const groundData = parseLayerData(groundLayer);
  const collisionData = collisionLayer ? parseLayerData(collisionLayer) : [];

  const tileWidth = mapData.tilewidth;
  const tileHeight = mapData.tileheight;
  const mapWidth = mapData.width;
  const mapHeight = mapData.height;
  const firstGid = tilesetDef.firstgid;
  const columns = tilesetDef.columns;
  const outlinedTileMasks = new Map();

  for (const gid of OUTLINED_TILE_GIDS) {
    const tileIndex = gid - firstGid;
    if (tileIndex < 0) continue;
    outlinedTileMasks.set(gid, buildTileMask(image, tileIndex, columns, tileWidth, tileHeight));
  }

  const map = {
    tileWidth,
    tileHeight,
    width: mapWidth,
    height: mapHeight,
    pixelWidth: mapWidth * tileWidth,
    pixelHeight: mapHeight * tileHeight,
    groundData,
    collisionData,
    image,
    firstGid,
    columns,
    spawn: getSpawnPoint(mapData),

    isSolid(col, row) {
      const idx = row * mapWidth + col;
      return (collisionData[idx] || 0) > 0;
    },

    draw(ctx, cameraX, cameraY, viewW, viewH, scale) {
      const startCol = Math.max(0, Math.floor(cameraX / tileWidth));
      const startRow = Math.max(0, Math.floor(cameraY / tileHeight));
      const endCol = Math.min(mapWidth, Math.ceil((cameraX + viewW) / tileWidth) + 1);
      const endRow = Math.min(mapHeight, Math.ceil((cameraY + viewH) / tileHeight) + 1);

      ctx.imageSmoothingEnabled = false;

      const drawLayer = (layerData) => {
        for (let row = startRow; row < endRow; row++) {
          for (let col = startCol; col < endCol; col++) {
            const idx = row * mapWidth + col;
            const gid = layerData[idx];
            if (!gid) continue;

            const tileIndex = gid - firstGid;
            if (tileIndex < 0) continue;

            const srcX = (tileIndex % columns) * tileWidth;
            const srcY = Math.floor(tileIndex / columns) * tileHeight;
            const destX = Math.round((col * tileWidth - cameraX) * scale);
            const destY = Math.round((row * tileHeight - cameraY) * scale);
            const px = scale;
            const mask = outlinedTileMasks.get(gid);

            if (mask) {
              drawTileOutline(ctx, destX, destY, px, mask);
            }

            ctx.drawImage(
              image,
              srcX,
              srcY,
              tileWidth,
              tileHeight,
              destX,
              destY,
              tileWidth * scale,
              tileHeight * scale
            );
          }
        }
      };

      // ground = chão; collision = objetos sólidos (árvores, casas, água…)
      drawLayer(groundData);
      if (collisionData.length) {
        drawLayer(collisionData);
      }
    },
  };

  map.id = getMapId(mapFetchUrl);
  map.defaultSpawn = getDefaultSpawn(map, mapData, collisionData);
  map.arbustoTiles = findArbustoTiles(mapData, collisionData);

  const regions = parseRegions(mapData);
  const regionLookup = createRegionLookup(regions);
  map.regions = regions;
  map.getRegionAt = regionLookup.getRegionAt.bind(regionLookup);
  map.getRegionNameAt = regionLookup.getRegionNameAt.bind(regionLookup);

  return map;
}
