/**
 * Loader e render de mapas Tiled (JSON).
 */

function resolveImagePath(mapUrl, imagePath) {
  const mapBase = new URL(mapUrl, window.location.href);
  return new URL(imagePath, mapBase).href;
}

function getLayer(mapData, name) {
  return mapData.layers.find((layer) => layer.type === 'tilelayer' && layer.name === name);
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
  const tilesetDef = mapData.tilesets[0];
  const imageUrl = resolveImagePath(mapFetchUrl, tilesetDef.image);

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

  const tileWidth = mapData.tilewidth;
  const tileHeight = mapData.tileheight;
  const mapWidth = mapData.width;
  const mapHeight = mapData.height;
  const firstGid = tilesetDef.firstgid || 1;
  const columns = tilesetDef.columns;

  const collisionData = collisionLayer?.data || [];

  const map = {
    tileWidth,
    tileHeight,
    width: mapWidth,
    height: mapHeight,
    pixelWidth: mapWidth * tileWidth,
    pixelHeight: mapHeight * tileHeight,
    groundData: groundLayer.data,
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
          const gid = groundLayer.data[idx];
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
