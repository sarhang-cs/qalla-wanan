import fs from 'node:fs';

const root = 'public/data/nav';
const labels = JSON.parse(fs.readFileSync(`${root}/labels.compact.json`, 'utf8'));
const boundary = JSON.parse(fs.readFileSync(`${root}/boundary.geojson`, 'utf8'));
const mask = JSON.parse(fs.readFileSync(`${root}/outside-mask.geojson`, 'utf8'));
const audit = JSON.parse(fs.readFileSync(`${root}/provenance-audit.json`, 'utf8'));

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function insideGeometry(point, geometry) {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(([outer, ...holes]) =>
      pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole))
    );
  }
  return false;
}

if (!Array.isArray(labels.items) || labels.items.length < 40000) {
  throw new Error(`label count too small: ${labels.items?.length}`);
}
const geometry = boundary.features?.[0]?.geometry;
if (!geometry) throw new Error('canonical boundary geometry missing');
if (!mask.features?.length) throw new Error('outside mask missing');

const ids = new Set();
const counts = {};
let outside = 0;
for (const row of labels.items) {
  if (!Array.isArray(row) || row.length < 9) throw new Error('invalid label row width');
  const [id, name, lng, lat, kind, minZoom, priority] = row;
  if (!id || !name || !Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(minZoom) || !Number.isFinite(priority)) {
    throw new Error(`invalid label row: ${JSON.stringify(row).slice(0, 180)}`);
  }
  if (ids.has(id)) throw new Error(`duplicate label id: ${id}`);
  ids.add(id);
  if (!insideGeometry([lng, lat], geometry)) outside++;
  counts[kind] = (counts[kind] || 0) + 1;
}
if (outside !== 0) throw new Error(`${outside} labels outside canonical boundary`);
if (labels.count !== labels.items.length) throw new Error('count metadata mismatch');
if (audit.ok !== true || audit.displayRecords !== labels.items.length || audit.outsideCanonicalBoundary !== 0) {
  throw new Error('provenance audit mismatch');
}
for (const [name, hash] of Object.entries(audit.rawInputs || {})) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`invalid raw source hash: ${name}`);
}

console.log(JSON.stringify({
  ok: true,
  release: labels.version,
  count: labels.items.length,
  counts,
  bbox: labels.bbox,
  outsideCanonicalBoundary: outside,
  duplicateIds: labels.items.length - ids.size,
  sourceLinked: audit.exactIdMatches
}, null, 2));
