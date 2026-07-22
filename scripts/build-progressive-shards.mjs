import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dataDir = path.join(root, 'public', 'data', 'nav');
const shardDir = path.join(dataDir, 'label-shards');
const GRID_ORIGIN = [41, 33];
const GRID_SIZE = 0.25;
const CORE_TIERS = new Set(['region', 'governorate', 'city', 'town']);

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
const collections = [readJson('labels-major.geojson'), readJson('labels-poi.geojson')];
const core = [];
const shards = new Map();
let detailCount = 0;

for (const collection of collections) {
  for (const feature of collection.features || []) {
    const tier = String(feature?.properties?.tier || '');
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    if (CORE_TIERS.has(tier)) {
      core.push(feature);
      continue;
    }
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const x = Math.floor((lng - GRID_ORIGIN[0]) / GRID_SIZE);
    const y = Math.floor((lat - GRID_ORIGIN[1]) / GRID_SIZE);
    const key = `${x}_${y}`;
    if (!shards.has(key)) shards.set(key, []);
    shards.get(key).push(feature);
    detailCount += 1;
  }
}

fs.rmSync(shardDir, { recursive: true, force: true });
fs.mkdirSync(shardDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'labels-core.geojson'), JSON.stringify({ type: 'FeatureCollection', features: core }));

const index = { version: '2026-07-22-qalla-wanan-r7-progressive-stable', gridOrigin: GRID_ORIGIN, gridSize: GRID_SIZE, count: detailCount, coreCount: core.length, shards: {} };
for (const [key, features] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  const file = `${key}.geojson`;
  fs.writeFileSync(path.join(shardDir, file), JSON.stringify({ type: 'FeatureCollection', features }));
  index.shards[key] = { file, count: features.length };
}
fs.writeFileSync(path.join(dataDir, 'label-shards-index.json'), JSON.stringify(index));
console.log(JSON.stringify({ ok: true, core: core.length, detail: detailCount, shards: shards.size }, null, 2));
