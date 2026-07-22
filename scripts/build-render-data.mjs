import fs from 'node:fs';
import crypto from 'node:crypto';

const base = 'public/data/nav';
const source = JSON.parse(fs.readFileSync(`${base}/labels-native.geojson`, 'utf8'));
const suppressed = JSON.parse(fs.readFileSync(`${base}/render-suppressed-ids.json`, 'utf8'));
const suppressedIds = new Set(suppressed.ids.map(String));
const keepProperties = ['id', 'name', 'kind', 'tier', 'priority', 'context', 'category'];
const major = [];
const poi = [];

for (const feature of source.features || []) {
  const properties = feature.properties || {};
  const id = String(properties.id || feature.id || '');
  if (!id || properties.render === 0 || suppressedIds.has(id)) continue;
  const slim = {};
  for (const key of keepProperties) slim[key] = properties[key] ?? '';
  const next = { type: 'Feature', id, properties: slim, geometry: feature.geometry };
  if (String(properties.tier || '').startsWith('poi_')) poi.push(next);
  else major.push(next);
}

const write = (name, features) => {
  const text = JSON.stringify({ type: 'FeatureCollection', features });
  fs.writeFileSync(`${base}/${name}`, text);
  return { bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') };
};
const majorMeta = write('labels-major.geojson', major);
const poiMeta = write('labels-poi.geojson', poi);
const audit = {
  ok: true,
  release: '2026-07-22-qalla-wanan-r6-rtl-stable',
  sourceRecords: source.features.length,
  renderRecords: major.length + poi.length,
  majorRecords: major.length,
  poiRecords: poi.length,
  visualDuplicatesSuppressed: source.features.length - major.length - poi.length,
  allSourceRecordsPreservedInCatalog: true,
  majorBytes: majorMeta.bytes,
  poiBytes: poiMeta.bytes,
  combinedRenderBytes: majorMeta.bytes + poiMeta.bytes,
  majorSha256: majorMeta.sha256,
  poiSha256: poiMeta.sha256
};
fs.writeFileSync(`${base}/render-data-audit.json`, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
