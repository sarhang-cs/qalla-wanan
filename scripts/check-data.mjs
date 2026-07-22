import fs from 'node:fs';
import crypto from 'node:crypto';

const root = 'public/data/nav';
const release = '2026-07-22-qalla-wanan-r11-nav-capsule-satellite-gps';
const labels = JSON.parse(fs.readFileSync(`${root}/labels.compact.json`, 'utf8'));
const native = JSON.parse(fs.readFileSync(`${root}/labels-native.geojson`, 'utf8'));
const major = JSON.parse(fs.readFileSync(`${root}/labels-major.geojson`, 'utf8'));
const poi = JSON.parse(fs.readFileSync(`${root}/labels-poi.geojson`, 'utf8'));
const detail = JSON.parse(fs.readFileSync(`${root}/labels-detail.geojson`, 'utf8'));
const boundary = JSON.parse(fs.readFileSync(`${root}/boundary.geojson`, 'utf8'));
const mask = JSON.parse(fs.readFileSync(`${root}/outside-mask.geojson`, 'utf8'));
const provenance = JSON.parse(fs.readFileSync(`${root}/provenance-audit.json`, 'utf8'));
const nativeAudit = JSON.parse(fs.readFileSync(`${root}/native-label-audit.json`, 'utf8'));
const renderAudit = JSON.parse(fs.readFileSync(`${root}/render-data-audit.json`, 'utf8'));

function pointOnSegment(point, a, b, epsilon = 1e-10) {
  const [x, y] = point;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < -epsilon) return false;
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return dot <= lengthSquared + epsilon;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (pointOnSegment(point, ring[j], ring[i])) return true;
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
if (!Array.isArray(labels.items) || labels.items.length !== 69_000) throw new Error(`R11 requires exactly 69,000 catalog records, found ${labels.items?.length}`);
if (labels.count !== 69_000) throw new Error(`catalog count metadata mismatch: ${labels.count}`);
if (native.type !== 'FeatureCollection' || !Array.isArray(native.features)) throw new Error('native labels are not a FeatureCollection');
if (native.features.length !== 69_000 || native.features.length !== labels.items.length) throw new Error(`native/source count mismatch: ${native.features.length}/${labels.items.length}`);

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

const renderFeatures = [...major.features, ...poi.features, ...detail.features];
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
if (renderFeatures.length !== 69_000 || renderIds.size !== 69_000) throw new Error(`not all 69,000 records are in native map sources: ${renderFeatures.length}/${renderIds.size}`);
if (major.features.length !== renderAudit.majorRecords || poi.features.length !== renderAudit.poiRecords || detail.features.length !== renderAudit.detailRecords) throw new Error('split render count mismatch');
if (renderFeatures.length !== renderAudit.renderRecords || labels.items.length !== renderAudit.sourceRecords) throw new Error('render audit count mismatch');
if (renderAudit.visualDuplicatesSuppressed !== 0) throw new Error('R11 must not suppress source records');

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (sha(`${root}/labels-major.geojson`) !== renderAudit.majorSha256) throw new Error('major labels SHA-256 mismatch');
if (sha(`${root}/labels-poi.geojson`) !== renderAudit.poiSha256) throw new Error('POI labels SHA-256 mismatch');
if (sha(`${root}/labels-detail.geojson`) !== renderAudit.detailSha256) throw new Error('detail labels SHA-256 mismatch');
if (provenance.ok !== true || provenance.exactIdMatches !== 69_000 || provenance.sourceBackedRecordsAdded !== 21_960) throw new Error('source provenance audit mismatch');
if (provenance.placeholderOrFakeRecordsAdded !== 0) throw new Error('provenance reports synthetic or placeholder additions');
if (nativeAudit.ok !== true || nativeAudit.nativeGeoJSONFeatures !== 69_000 || nativeAudit.nativeRenderFeatures !== 69_000) throw new Error('native source audit mismatch');

const requiredLargeAssets = {
  'full-source/kri-base.pmtiles': 10_000_000,
  'full-source/kri-roads.pmtiles': 3_000_000,
  'full-source/kri-localities-render.geojson': 8_000_000,
  'full-source/kri-pois-render.geojson': 20_000_000,
  'full-source/kri-natural-features.geojson': 6_000_000,
  'full-source/kri-road-labels.geojson': 2_000_000,
  'full-source/kri-labels-69000.geojson': 30_000_000,
  'expanded-source-records.json': 8_000_000
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
  release,
  sourceRecords: labels.items.length,
  renderRecords: renderFeatures.length,
  majorRecords: major.features.length,
  poiRecords: poi.features.length,
  detailRecords: detail.features.length,
  outsideCanonicalBoundary: outside,
  renderOutsideCanonicalBoundary: renderOutside,
  coordinateMismatch,
  duplicateSourceIds: labels.items.length - sourceIds.size,
  duplicateRenderIds: renderFeatures.length - renderIds.size,
  malformedNames,
  splitRenderBytes: fs.statSync(`${root}/labels-major.geojson`).size + fs.statSync(`${root}/labels-poi.geojson`).size + fs.statSync(`${root}/labels-detail.geojson`).size,
  fullSourceBytes,
  sourceLinked: provenance.exactIdMatches,
  sourceBackedAdditions: provenance.sourceBackedRecordsAdded,
  fakeRecordsAdded: provenance.placeholderOrFakeRecordsAdded
}, null, 2));
