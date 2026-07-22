import fs from 'node:fs';
import crypto from 'node:crypto';

const root = 'public/data/nav';
const labels = JSON.parse(fs.readFileSync(`${root}/labels.compact.json`, 'utf8'));
const native = JSON.parse(fs.readFileSync(`${root}/labels-native.geojson`, 'utf8'));
const major = JSON.parse(fs.readFileSync(`${root}/labels-major.geojson`, 'utf8'));
const poi = JSON.parse(fs.readFileSync(`${root}/labels-poi.geojson`, 'utf8'));
const boundary = JSON.parse(fs.readFileSync(`${root}/boundary.geojson`, 'utf8'));
const mask = JSON.parse(fs.readFileSync(`${root}/outside-mask.geojson`, 'utf8'));
const provenance = JSON.parse(fs.readFileSync(`${root}/provenance-audit.json`, 'utf8'));
const nativeAudit = JSON.parse(fs.readFileSync(`${root}/native-label-audit.json`, 'utf8'));
const renderAudit = JSON.parse(fs.readFileSync(`${root}/render-data-audit.json`, 'utf8'));
const core = JSON.parse(fs.readFileSync(`${root}/labels-core.geojson`, 'utf8'));
const shardIndex = JSON.parse(fs.readFileSync(`${root}/label-shards-index.json`, 'utf8'));

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

const sourceIds = new Set();
let outside = 0;
let coordinateMismatch = 0;
let malformedNames = 0;
for (let index = 0; index < labels.items.length; index++) {
  const row = labels.items[index];
  const feature = native.features[index];
  const [id, name, lng, lat] = row;
  if (!feature || feature.geometry?.type !== 'Point') throw new Error(`invalid native point at ${index}`);
  const [nativeLng, nativeLat] = feature.geometry.coordinates;
  if (String(feature.properties?.id) !== String(id) || String(feature.properties?.name) !== String(name)) throw new Error(`native identity mismatch at ${index}`);
  if (nativeLng !== lng || nativeLat !== lat) coordinateMismatch++;
  if (sourceIds.has(String(id))) throw new Error(`duplicate id: ${id}`);
  sourceIds.add(String(id));
  if (!insideGeometry([nativeLng, nativeLat], geometry)) outside++;
  if (!String(name || '').trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(String(name))) malformedNames++;
}
if (outside) throw new Error(`${outside} source labels outside canonical boundary`);
if (coordinateMismatch) throw new Error(`${coordinateMismatch} source coordinate mismatches`);
if (malformedNames) throw new Error(`${malformedNames} malformed source names`);

const renderFeatures = [...major.features, ...poi.features];
const renderIds = new Set();
let renderOutside = 0;
for (const feature of renderFeatures) {
  const id = String(feature.properties?.id || feature.id || '');
  if (!id || !sourceIds.has(id)) throw new Error(`render feature is not source-linked: ${id}`);
  if (renderIds.has(id)) throw new Error(`duplicate render id: ${id}`);
  renderIds.add(id);
  if (!insideGeometry(feature.geometry.coordinates, geometry)) renderOutside++;
  const keys = Object.keys(feature.properties || {}).sort().join(',');
  if (keys !== 'category,context,id,kind,name,priority,tier') throw new Error(`unexpected render properties for ${id}: ${keys}`);
}
if (renderOutside) throw new Error(`${renderOutside} render labels outside canonical boundary`);
if (major.features.length !== renderAudit.majorRecords || poi.features.length !== renderAudit.poiRecords) throw new Error('split render count mismatch');
if (renderFeatures.length !== renderAudit.renderRecords) throw new Error('combined render count mismatch');
if (labels.items.length !== renderAudit.sourceRecords) throw new Error('render audit source count mismatch');
if (renderFeatures.length + renderAudit.visualDuplicatesSuppressed !== labels.items.length) throw new Error('render suppression arithmetic mismatch');

const progressiveFeatures = [...(core.features || [])];
for (const [key, meta] of Object.entries(shardIndex.shards || {})) {
  const file = `${root}/label-shards/${meta.file}`;
  if (!fs.existsSync(file)) throw new Error(`missing label shard: ${key}`);
  const collection = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(collection.features) || collection.features.length !== meta.count) throw new Error(`label shard count mismatch: ${key}`);
  progressiveFeatures.push(...collection.features);
}
if (core.features.length !== shardIndex.coreCount) throw new Error('core label count mismatch');
if (progressiveFeatures.length !== renderFeatures.length) throw new Error(`progressive/render count mismatch: ${progressiveFeatures.length}/${renderFeatures.length}`);
const progressiveIds = new Set(progressiveFeatures.map((feature) => String(feature.properties?.id || feature.id || '')));
if (progressiveIds.size !== renderIds.size) throw new Error('progressive label duplicate or missing ids');
for (const id of renderIds) if (!progressiveIds.has(id)) throw new Error(`progressive label missing render id: ${id}`);

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (sha(`${root}/labels-major.geojson`) !== renderAudit.majorSha256) throw new Error('major labels SHA-256 mismatch');
if (sha(`${root}/labels-poi.geojson`) !== renderAudit.poiSha256) throw new Error('POI labels SHA-256 mismatch');
if (provenance.ok !== true || provenance.exactIdMatches !== labels.items.length) throw new Error('source provenance audit mismatch');
if (nativeAudit.ok !== true || nativeAudit.nativeGeoJSONFeatures !== labels.items.length) throw new Error('native source audit mismatch');

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
  release: '2026-07-22-qalla-wanan-r8-native-label-recovery',
  sourceRecords: labels.items.length,
  renderRecords: renderFeatures.length,
  visualDuplicatesSuppressed: renderAudit.visualDuplicatesSuppressed,
  allSourceRecordsPreservedInCatalog: renderAudit.allSourceRecordsPreservedInCatalog,
  outsideCanonicalBoundary: outside,
  renderOutsideCanonicalBoundary: renderOutside,
  coordinateMismatch,
  duplicateSourceIds: labels.items.length - sourceIds.size,
  duplicateRenderIds: renderFeatures.length - renderIds.size,
  malformedNames,
  splitRenderBytes: fs.statSync(`${root}/labels-major.geojson`).size + fs.statSync(`${root}/labels-poi.geojson`).size,
  progressiveCoreRecords: core.features.length,
  progressiveShardRecords: shardIndex.count,
  progressiveShardFiles: Object.keys(shardIndex.shards || {}).length,
  fullSourceBytes,
  sourceLinked: provenance.exactIdMatches
}, null, 2));
