import fs from 'node:fs';
import crypto from 'node:crypto';

const base = 'public/data/nav';
const release = '2026-07-23-qalla-wanan-r14-money-heist-rtl';
const source = JSON.parse(fs.readFileSync(`${base}/labels-native.geojson`, 'utf8'));
const keepProperties = ['id', 'name', 'kind', 'tier', 'priority', 'context', 'category'];
const normalizeDisplayName = (value) => String(value || '')
  .normalize('NFC')
  .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const major = [];
const poi = [];
const detail = [];

for (const feature of source.features || []) {
  const properties = feature.properties || {};
  const id = String(properties.id || feature.id || '');
  if (!id || properties.render === 0) continue;
  const slim = {};
  for (const key of keepProperties) slim[key] = properties[key] ?? '';
  slim.display_name = normalizeDisplayName(properties.display_name || properties.name);
  const next = { type: 'Feature', id, properties: slim, geometry: feature.geometry };
  if (String(properties.tier || '') === 'poi_detail') detail.push(next);
  else if (String(properties.tier || '').startsWith('poi_')) poi.push(next);
  else major.push(next);
}

const write = (name, features) => {
  const text = JSON.stringify({ type: 'FeatureCollection', features });
  fs.writeFileSync(`${base}/${name}`, text);
  return {
    bytes: Buffer.byteLength(text),
    sha256: crypto.createHash('sha256').update(text).digest('hex')
  };
};

const majorMeta = write('labels-major.geojson', major);
const poiMeta = write('labels-poi.geojson', poi);
const detailMeta = write('labels-detail.geojson', detail);
const renderRecords = major.length + poi.length + detail.length;
if (renderRecords !== 69_000 || renderRecords !== source.features.length) {
  throw new Error(`R14 render count mismatch: source=${source.features.length} render=${renderRecords}`);
}

const audit = {
  ok: true,
  release,
  sourceRecords: source.features.length,
  renderRecords,
  majorRecords: major.length,
  poiRecords: poi.length,
  detailRecords: detail.length,
  visualDuplicatesSuppressed: 0,
  allSourceRecordsPreservedInCatalog: true,
  majorBytes: majorMeta.bytes,
  poiBytes: poiMeta.bytes,
  detailBytes: detailMeta.bytes,
  combinedRenderBytes: majorMeta.bytes + poiMeta.bytes + detailMeta.bytes,
  majorSha256: majorMeta.sha256,
  poiSha256: poiMeta.sha256,
  detailSha256: detailMeta.sha256
};
fs.writeFileSync(`${base}/render-data-audit.json`, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
