/**
 * Loader e render de mapas Tiled (JSON / TMJ).
 */

function resolveAssetPath(baseUrl, relativePath) {
  const base = new URL(baseUrl, window.location.href);
  return new URL(relativePath, base).href;
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

  const tsxUrl = resolveAssetPath(mapUrl, tilesetRef.source);
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
  const response = await fetch(mapFetchUrl);
  if (!response.ok) {
    throw new Error(`Falha ao carregar mapa: ${mapUrl}`);
  }

  const mapData = await response.json();
  const tilesetDef = await loadTilesetDef(mapFetchUrl, mapData.tilesets[0]);
  const imageUrl = resolveAssetPath(tilesetDef.imageBaseUrl, tilesetDef.imagePath);

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

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const idx = row * mapWidth + col;
          const gid = groundData[idx];
          if (!gid) continue;

          const tileIndex = gid - firstGid;
          if (tileIndex < 0) continue;

          const srcX = (tileIndex % columns) * tileWidth;
          const srcY = Math.floor(tileIndex / columns) * tileHeight;
          const destX = Math.round((col * tileWidth - cameraX) * scale);
          const destY = Math.round((row * tileHeight - cameraY) * scale);

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
    },
  };

  return map;
}
