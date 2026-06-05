/**
 * Regiões nomeadas — object layer "regions" do Tiled (retângulos e polígonos).
 */

function parseObjectProperties(properties = []) {
  const out = {};
  for (const prop of properties) {
    if (prop.name != null) out[prop.name] = prop.value;
  }
  return out;
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function pointInPolygon(x, y, obj) {
  const points = obj.polygon;
  if (!points?.length) return false;

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = obj.x + points[i].x;
    const yi = obj.y + points[i].y;
    const xj = obj.x + points[j].x;
    const yj = obj.y + points[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function containsPoint(region, x, y) {
  if (region.polygon?.length) {
    return pointInPolygon(x, y, region);
  }
  if (region.width > 0 && region.height > 0) {
    return pointInRect(x, y, region);
  }
  return false;
}

function normalizeRegion(obj) {
  const name = String(obj.name || '').trim();
  if (!name) return null;

  return {
    id: obj.id,
    name,
    type: obj.type || '',
    x: obj.x,
    y: obj.y,
    width: obj.width || 0,
    height: obj.height || 0,
    polygon: Array.isArray(obj.polygon) ? obj.polygon : null,
    properties: parseObjectProperties(obj.properties),
  };
}

export function parseRegions(mapData, layerName = 'regions') {
  const layer = mapData.layers?.find(
    (entry) => entry.type === 'objectgroup' && entry.name === layerName
  );
  if (!layer?.objects?.length) return [];

  return layer.objects.map(normalizeRegion).filter(Boolean);
}

export function createRegionLookup(regions) {
  function getRegionAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    for (let i = regions.length - 1; i >= 0; i--) {
      if (containsPoint(regions[i], x, y)) return regions[i];
    }
    return null;
  }

  return {
    regions,
    getRegionAt,
    getRegionNameAt(x, y) {
      return getRegionAt(x, y)?.name ?? null;
    },
  };
}
