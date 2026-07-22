import fs from 'node:fs';
import crypto from 'node:crypto';

const root = 'public/data/nav';
const labels = JSON.parse(fs.readFileSync(`${root}/labels.compact.json`, 'utf8'));
const native = JSON.parse(fs.readFileSync(`${root}/labels-native.geojson`, 'utf8'));
const boundary = JSON.parse(fs.readFileSync(`${root}/boundary.geojson`, 'utf8'));
const mask = JSON.parse(fs.readFileSync(`${root}/outside-mask.geojson`, 'utf8'));
const provenance = JSON.parse(fs.readFileSync(`${root}/provenance-audit.json`, 'utf8'));
const nativeAudit = JSON.parse(fs.readFileSync(`${root}/native-label-audit.json`, 'utf8'));

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

const geometry = boundary.features?.[0]?.geometry;
if (!geometry) throw new Error('canonical boundary geometry missing');
if (!mask.features?.length) throw new Error('outside mask missing');
if (!Array.isArray(labels.items) || labels.items.length < 40000) throw new Error(`label count too small: ${labels.items?.length}`);
if (native.type !== 'FeatureCollection' || !Array.isArray(native.features)) throw new Error('native labels are not a FeatureCollection');
if (native.features.length !== labels.items.length) throw new Error(`native/source count mismatch: ${native.features.length}/${labels.items.length}`);

const ids = new Set();
let outside = 0;
let coordinateMismatch = 0;
let renderCount = 0;
for (let index = 0; index < labels.items.length; index++) {
  const row = labels.items[index];
  const feature = native.features[index];
  const [id, name, lng, lat] = row;
  if (!feature || feature.geometry?.type !== 'Point') throw new Error(`invalid native point at ${index}`);
  const [nativeLng, nativeLat] = feature.geometry.coordinates;
  if (String(feature.properties?.id) !== String(id) || String(feature.properties?.name) !== String(name)) throw new Error(`native identity mismatch at ${index}`);
  if (nativeLng !== lng || nativeLat !== lat) coordinateMismatch++;
  if (ids.has(String(id))) throw new Error(`duplicate id: ${id}`);
  ids.add(String(id));
  if (!insideGeometry([nativeLng, nativeLat], geometry)) outside++;
  if (feature.properties?.render === 1) renderCount++;
}

if (outside !== 0) throw new Error(`${outside} native labels outside canonical boundary`);
if (coordinateMismatch !== 0) throw new Error(`${coordinateMismatch} native coordinate mismatches`);
if (provenance.ok !== true || provenance.exactIdMatches !== labels.items.length) throw new Error('source provenance audit mismatch');
if (nativeAudit.ok !== true || nativeAudit.nativeGeoJSONFeatures !== labels.items.length || nativeAudit.nativeRenderFeatures !== renderCount) throw new Error('native label audit mismatch');

const nativeHash = crypto.createHash('sha256').update(fs.readFileSync(`${root}/labels-native.geojson`)).digest('hex');
if (nativeHash !== nativeAudit.sha256) throw new Error('native label SHA-256 mismatch');

const requiredLargeAssets = {
  'full-source/kri-base.pmtiles': 10_000_000,
  'full-source/kri-roads.pmtiles': 3_000_000,
  'full-source/kri-localities-render.geojson': 8_000_000,
  'full-source/kri-pois-render.geojson': 20_000_000,
  'full-source/kri-natural-features.geojson': 6_000_000,
  'full-source/kri-road-labels.geojson': 2_000_000
};
let fullSourceBytes = 0;
for (const [relative, minimum] of Object.entries(requiredLargeAssets)) {
  const file = `${root}/${relative}`;
  if (!fs.existsSync(file)) throw new Error(`missing full source asset: ${relative}`);
  const size = fs.statSync(file).size;
  if (size < minimum) throw new Error(`full source asset too small: ${relative} (${size})`);
  fullSourceBytes += size;
}

console.log(JSON.stringify({
  ok: true,
  release: nativeAudit.release,
  sourceRecords: labels.items.length,
  nativeFeatures: native.features.length,
  nativeRenderFeatures: renderCount,
  visualMajorDuplicatesSuppressed: labels.items.length - renderCount,
  outsideCanonicalBoundary: outside,
  coordinateMismatch,
  duplicateIds: labels.items.length - ids.size,
  nativeGeoJSONBytes: fs.statSync(`${root}/labels-native.geojson`).size,
  fullSourceBytes,
  sourceLinked: provenance.exactIdMatches
}, null, 2));
