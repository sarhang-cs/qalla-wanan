import { loadPublishedPlaces } from './backend.js';

const DATA_BASE = new URL('../data/nav/', import.meta.url).href.replace(/\/$/, '');
const CONFIG = window.__APP_CONFIG__ || {};
const DATA_VERSION = String(CONFIG.VITE_MAP_DATA_VERSION || '2026-07-22-qalla-wanan-r8-native-label-recovery').trim();
const MAPTILER_KEY = String(CONFIG.VITE_MAPTILER_KEY || '').trim();
const RTL_PLUGIN_URL = 'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js';
const SHARD_INDEX_URL = 'label-shards-index.json';
const SHARD_DIR = 'label-shards';
const assetUrl = (relative) => `${DATA_BASE}/${relative}?v=${encodeURIComponent(DATA_VERSION)}`;
const ROUTING_BASE = String(CONFIG.VITE_ROUTING_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const EARTH_RADIUS_M = 6371008.8;
const LABEL_FONT_FAMILY = 'UniQAIDAR Hewal 031';
const LABEL_FONT_URL = new URL('../fonts/UniQAIDAR_Hewal_031.ttf', import.meta.url).href;
const LABEL_FONT_STACK = [LABEL_FONT_FAMILY, 'Qalla Hewal', 'Noto Sans Arabic', 'Noto Naskh Arabic', 'Arial', 'sans-serif'];
const SAFE_LABEL_FONT_STACK = ['Noto Sans Arabic', 'Noto Naskh Arabic', 'Arial', 'sans-serif'];
const NATIVE_LABEL_LAYER_IDS = [
  'nav-label-region', 'nav-label-governorate', 'nav-label-city', 'nav-label-town',
  'nav-label-locality', 'nav-label-natural', 'nav-label-road',
  'nav-label-poi-landmark', 'nav-label-poi-regional', 'nav-label-poi-local',
  'nav-label-poi-detail', 'nav-label-custom'
];

let map = null;
let mapReadyPromise = null;
let boundaryGeometry = null;
let allItems = [];
let searchIndex = [];
let searchTimer = 0;
let selectedDestination = null;
let currentPosition = null;
let gpsWatchId = null;
let terrainEnabled = false;
let routeBusy = false;
let routeLastAt = 0;
let routeLastOrigin = null;
let routeAbortController = null;
let gpsState = null;
let itemById = new Map();
let pendingCustomItems = [];
let catalogPromise = null;
let loaderHidden = false;
let labelFontFallbackActive = false;
let shardIndex = null;
let shardIndexPromise = null;
let shardCache = new Map();
let shardRequestToken = 0;
let shardRefreshTimer = 0;
const MAX_SHARD_CACHE = 96;

const q = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toast = (message) => {
  if (typeof window.toast === 'function') window.toast(message);
  else console.info('[NAV]', message);
};
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function configureMapWorkers() {
  if (!window.maplibregl?.setWorkerCount) return;
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 4);
  const memory = Math.max(0, Number(navigator.deviceMemory) || 0);
  const count = memory > 0 && memory <= 2 ? 1 : cores >= 8 ? 3 : cores >= 4 ? 2 : 1;
  window.maplibregl.setWorkerCount(count);
}

function esriSatelliteSource() {
  return {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    bounds: [41.0, 33.0, 46.7, 37.7],
    // Esri has patchy native coverage at the deepest levels. Capping native
    // requests at z17 makes MapLibre overzoom a valid tile instead of asking
    // the server for its grey "Map data not yet available" placeholder.
    maxzoom: 16,
    attribution: 'Esri, Maxar, Earthstar Geographics'
  };
}

function baseStyle(boundary, mask) {
  const sources = {
    'satellite-primary': esriSatelliteSource(),
    ...(MAPTILER_KEY ? {
      'satellite-maptiler': {
        type: 'raster',
        url: `https://api.maptiler.com/tiles/satellite-v4/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
        tileSize: 256
      }
    } : {}),
    'nav-outside': { type: 'geojson', data: mask },
    'nav-boundary': { type: 'geojson', data: boundary },
    'nav-label-core': {
      type: 'geojson', data: assetUrl('labels-core.geojson'), promoteId: 'id',
      cluster: false, tolerance: 0, buffer: 192, maxzoom: 18
    },
    'nav-label-view': {
      type: 'geojson', data: emptyFeatureCollection(), promoteId: 'id',
      cluster: false, tolerance: 0, buffer: 192, maxzoom: 18
    },
    'nav-custom-label-source': {
      type: 'geojson', data: emptyFeatureCollection(), promoteId: 'id',
      cluster: false, tolerance: 0, buffer: 192, maxzoom: 18
    },
    'nav-route': { type: 'geojson', data: emptyFeatureCollection() },
    'nav-destination': { type: 'geojson', data: emptyFeatureCollection() },
    'nav-gps': { type: 'geojson', data: emptyFeatureCollection() }
  };

  if (MAPTILER_KEY) {
    sources.terrain = {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      tileSize: 256
    };
  }

  const layers = [
    { id: 'nav-background', type: 'background', paint: { 'background-color': '#050a12' } },
    {
      id: 'satellite-primary',
      type: 'raster',
      source: 'satellite-primary',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        'raster-fade-duration': 0,
        'raster-opacity': 1,
        'raster-resampling': 'linear'
      }
    },
    ...(MAPTILER_KEY ? [{
      id: 'satellite-maptiler',
      type: 'raster',
      source: 'satellite-maptiler',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        'raster-fade-duration': 0,
        'raster-opacity': 1,
        'raster-resampling': 'linear'
      }
    }] : []),
    {
      id: 'nav-outside-dark',
      type: 'fill',
      source: 'nav-outside',
      paint: {
        'fill-color': '#030712',
        'fill-opacity': 0.84,
        'fill-antialias': false
      }
    },
    {
      id: 'nav-boundary-line',
      type: 'line',
      source: 'nav-boundary',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#f5c66b',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2.2, 15, 3.2],
        'line-opacity': 0.9
      }
    },
    ...nativeLabelDefinitions.map((definition) => ({
      id: definition.id,
      type: 'symbol',
      source: definition.source,
      minzoom: definition.minzoom,
      maxzoom: definition.maxzoom,
      filter: ['==', ['get', 'tier'], definition.tier],
      layout: nativeLabelLayout(definition),
      paint: nativeLabelPaint(definition)
    })),
    {
      id: 'nav-label-custom',
      type: 'symbol',
      source: 'nav-custom-label-source',
      minzoom: 11.8,
      maxzoom: 21,
      layout: nativeLabelLayout({
        size: ['interpolate', ['linear'], ['zoom'], 11.8, 9.4, 17, 11.2, 20.5, 12.6],
        padding: 5, maxWidth: 10, overlap: false
      }),
      paint: nativeLabelPaint({ color: '#ffffff', halo: 1.65 })
    },
    {
      id: 'nav-route-casing',
      type: 'line',
      source: 'nav-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#071426',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 5, 13, 8, 18, 12],
        'line-opacity': 0.92
      }
    },
    {
      id: 'nav-route-line',
      type: 'line',
      source: 'nav-route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2e7cf6',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 13, 5, 18, 8],
        'line-opacity': 0.98
      }
    },
    {
      id: 'nav-destination-halo',
      type: 'circle',
      source: 'nav-destination',
      paint: { 'circle-radius': 11, 'circle-color': '#f5b366', 'circle-opacity': 0.2 }
    },
    {
      id: 'nav-destination-dot',
      type: 'circle',
      source: 'nav-destination',
      paint: {
        'circle-radius': 5,
        'circle-color': '#f5b366',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    },
    {
      id: 'nav-gps-accuracy',
      type: 'circle',
      source: 'nav-gps',
      paint: {
        'circle-radius': 20,
        'circle-color': '#2e7cf6',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#73a8ff',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.35
      }
    },
    { id: 'nav-gps-halo', type: 'circle', source: 'nav-gps', paint: { 'circle-radius': 13, 'circle-color': '#2e7cf6', 'circle-opacity': 0.24 } },
    {
      id: 'nav-gps-ring',
      type: 'circle',
      source: 'nav-gps',
      paint: {
        'circle-radius': 9,
        'circle-color': '#ffffff',
        'circle-opacity': 1,
        'circle-stroke-color': '#14223a',
        'circle-stroke-width': 1.4
      }
    },
    { id: 'nav-gps-dot', type: 'circle', source: 'nav-gps', paint: { 'circle-radius': 6, 'circle-color': '#2e7cf6', 'circle-opacity': 1 } }
  ];

  return {
    version: 8,
    name: 'Qalla Wanan NAV KURD R8',
    sources,
    layers,
    transition: { duration: 0, delay: 0 }
  };
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function pointFeature(coordinates, properties = {}) {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates } }]
  };
}

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

function pointInBoundary(lng, lat) {
  if (!boundaryGeometry) return true;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const point = [lng, lat];
  if (boundaryGeometry.type === 'Polygon') {
    const [outer, ...holes] = boundaryGeometry.coordinates;
    return pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole));
  }
  if (boundaryGeometry.type === 'MultiPolygon') {
    return boundaryGeometry.coordinates.some(([outer, ...holes]) =>
      pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole))
    );
  }
  return true;
}

function geometryBbox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      bbox[0] = Math.min(bbox[0], value[0]);
      bbox[1] = Math.min(bbox[1], value[1]);
      bbox[2] = Math.max(bbox[2], value[0]);
      bbox[3] = Math.max(bbox[3], value[1]);
      return;
    }
    for (const child of value) visit(child);
  };
  visit(geometry?.coordinates);
  return bbox.every(Number.isFinite) ? bbox : [41.285803, 33.305387, 46.34873, 37.377264];
}

function normalizeText(text) {
  return String(text || '')
    .toLocaleLowerCase('ku')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ە')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function haversineMeters(a, b) {
  const toRad = Math.PI / 180;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const kindNames = {
  region: 'هەرێم', governorate: 'پارێزگا', city: 'شار', town: 'شارۆچکە', village: 'گوند',
  hamlet: 'گوندۆچکە', suburb: 'گەڕەک', neighbourhood: 'گەڕەک', locality: 'شوێن', natural: 'سروشت',
  road: 'ڕێگا', poi: 'شوێن/دوکان', custom: 'شوێنی تۆمارکراو'
};

const nativeLabelDefinitions = [
  { id: 'nav-label-region', source: 'nav-label-core', tier: 'region', minzoom: 5.0, maxzoom: 8.2, size: ['interpolate', ['linear'], ['zoom'], 5.0, 18, 8.0, 22], color: '#ffe39a', halo: 2.2, padding: 4, maxWidth: 12, overlap: true },
  { id: 'nav-label-governorate', source: 'nav-label-core', tier: 'governorate', minzoom: 5.7, maxzoom: 10.0, size: ['interpolate', ['linear'], ['zoom'], 5.7, 12.5, 9.8, 16.5], color: '#fff0be', halo: 2.0, padding: 5, maxWidth: 11, overlap: true },
  { id: 'nav-label-city', source: 'nav-label-core', tier: 'city', minzoom: 6.2, maxzoom: 16.0, size: ['interpolate', ['linear'], ['zoom'], 6.2, 12, 10, 15, 15.5, 17.5], color: '#ffffff', halo: 2.0, padding: 6, maxWidth: 10, overlap: true },
  { id: 'nav-label-town', source: 'nav-label-core', tier: 'town', minzoom: 7.8, maxzoom: 18.5, size: ['interpolate', ['linear'], ['zoom'], 7.8, 10.5, 13, 12.8, 18, 14.2], color: '#ffffff', halo: 1.8, padding: 6, maxWidth: 10, overlap: false },
  { id: 'nav-label-locality', source: 'nav-label-view', tier: 'locality', minzoom: 9.5, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 9.5, 9.4, 15, 11.2, 20, 12.7], color: '#f4f7fb', halo: 1.6, padding: 5, maxWidth: 10, overlap: false },
  { id: 'nav-label-natural', source: 'nav-label-view', tier: 'natural', minzoom: 10.2, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 10.2, 9.2, 15, 11, 20, 12.3], color: '#c8f5dc', halo: 1.55, padding: 5, maxWidth: 10, overlap: false },
  { id: 'nav-label-road', source: 'nav-label-view', tier: 'road', minzoom: 12.2, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 12.2, 8.7, 17, 10.6, 20, 11.7], color: '#ffe0a1', halo: 1.5, padding: 4, maxWidth: 11, overlap: false },
  { id: 'nav-label-poi-landmark', source: 'nav-label-view', tier: 'poi_landmark', minzoom: 9.8, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 9.8, 9.3, 15, 11.2, 20, 12.7], color: '#ffffff', halo: 1.65, padding: 5, maxWidth: 10, overlap: false },
  { id: 'nav-label-poi-regional', source: 'nav-label-view', tier: 'poi_regional', minzoom: 11.2, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 11.2, 9, 16, 10.9, 20, 12.2], color: '#ffffff', halo: 1.55, padding: 5, maxWidth: 10, overlap: false },
  { id: 'nav-label-poi-local', source: 'nav-label-view', tier: 'poi_local', minzoom: 13.2, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 13.2, 8.6, 18, 10.5, 20.5, 11.7], color: '#ffffff', halo: 1.5, padding: 4, maxWidth: 9, overlap: false },
  { id: 'nav-label-poi-detail', source: 'nav-label-view', tier: 'poi_detail', minzoom: 15.8, maxzoom: 21.0, size: ['interpolate', ['linear'], ['zoom'], 15.8, 8.3, 19, 10.1, 20.5, 11.1], color: '#ffffff', halo: 1.4, padding: 3, maxWidth: 9, overlap: false }
];

function nativeLabelLayout(definition) {
  return {
    'symbol-placement': 'point',
    'symbol-z-order': 'source',
    'symbol-sort-key': ['-', 0, ['to-number', ['get', 'priority']]],
    'symbol-avoid-edges': false,
    'text-field': ['coalesce', ['get', 'display_name'], ['get', 'name']],
    'text-font': LABEL_FONT_STACK,
    'text-size': definition.size,
    'text-anchor': 'center',
    'text-justify': 'center',
    'text-offset': [0, 0],
    'text-max-width': definition.maxWidth,
    'text-line-height': 1.15,
        'text-letter-spacing': 0,
    'text-padding': definition.padding,
    'text-allow-overlap': Boolean(definition.overlap),
    'text-ignore-placement': false,
    'text-optional': false,
    'text-keep-upright': true,
    'text-rotation-alignment': 'viewport',
    'text-pitch-alignment': 'viewport'
  };
}

function nativeLabelPaint(definition) {
  return {
    'text-color': definition.color,
    'text-opacity': 1,
    'text-halo-color': 'rgba(1,6,18,0.96)',
    'text-halo-width': definition.halo,
    'text-halo-blur': 0.18
  };
}

function installNativeLabelLayers() {
  const requiredSources = ['nav-label-core', 'nav-label-view', 'nav-custom-label-source'];
  const requiredLayers = [...nativeLabelDefinitions.map((definition) => definition.id), 'nav-label-custom'];
  const missingSources = requiredSources.filter((id) => !map?.getSource(id));
  const missingLayers = requiredLayers.filter((id) => !map?.getLayer(id));
  if (missingSources.length || missingLayers.length) {
    throw new Error(`native label style contract missing: sources=${missingSources.join(',')} layers=${missingLayers.join(',')}`);
  }
}


function withTimeout(promise, timeout, fallback = null) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => window.setTimeout(() => resolve(fallback), timeout))
  ]);
}

async function loadShardIndex() {
  if (shardIndex) return shardIndex;
  if (!shardIndexPromise) {
    shardIndexPromise = fetch(assetUrl(SHARD_INDEX_URL), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`shard index HTTP ${response.status}`);
        return response.json();
      })
      .then((value) => {
        shardIndex = value;
        return value;
      })
      .catch((error) => {
        console.warn('[NAV shard index]', error);
        shardIndexPromise = null;
        return null;
      });
  }
  return shardIndexPromise;
}

function visibleShardKeys(index) {
  if (!map || !index || map.getZoom() < 8.2) return [];
  const bounds = map.getBounds();
  const paddingLng = Math.max(0.18, (bounds.getEast() - bounds.getWest()) * 0.18);
  const paddingLat = Math.max(0.14, (bounds.getNorth() - bounds.getSouth()) * 0.18);
  const west = bounds.getWest() - paddingLng;
  const east = bounds.getEast() + paddingLng;
  const south = bounds.getSouth() - paddingLat;
  const north = bounds.getNorth() + paddingLat;
  const [originLng, originLat] = index.gridOrigin;
  const size = Number(index.gridSize) || 0.25;
  const minX = Math.floor((west - originLng) / size);
  const maxX = Math.floor((east - originLng) / size);
  const minY = Math.floor((south - originLat) / size);
  const maxY = Math.floor((north - originLat) / size);
  const keys = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const key = `${x}_${y}`;
      if (index.shards?.[key]) keys.push(key);
    }
  }
  return keys;
}

function touchShardCache(key, features) {
  shardCache.delete(key);
  shardCache.set(key, features);
  while (shardCache.size > MAX_SHARD_CACHE) {
    const oldest = shardCache.keys().next().value;
    shardCache.delete(oldest);
  }
}

async function fetchShard(index, key) {
  if (shardCache.has(key)) {
    const features = shardCache.get(key);
    touchShardCache(key, features);
    return features;
  }
  const file = index.shards?.[key]?.file;
  if (!file) return [];
  const response = await fetch(assetUrl(`${SHARD_DIR}/${file}`), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`label shard ${key} HTTP ${response.status}`);
  const value = await response.json();
  const features = Array.isArray(value.features) ? value.features : [];
  touchShardCache(key, features);
  return features;
}

async function refreshViewportLabels({ force = false } = {}) {
  const source = map?.getSource('nav-label-view');
  if (!source) return { count: 0 };
  const index = await loadShardIndex();
  if (!index) return { count: 0, error: true };
  const keys = visibleShardKeys(index);
  if (!keys.length) {
    source.setData(emptyFeatureCollection());
    return { count: 0 };
  }
  const token = ++shardRequestToken;
  const settled = await Promise.allSettled(keys.map((key) => fetchShard(index, key)));
  if (token !== shardRequestToken && !force) return { count: 0, stale: true };
  const features = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') features.push(...result.value);
    else console.warn('[NAV label shard]', result.reason);
  }
  source.setData({ type: 'FeatureCollection', features });
  return { count: features.length, shards: keys.length };
}

function scheduleViewportLabels() {
  window.clearTimeout(shardRefreshTimer);
  shardRefreshTimer = window.setTimeout(() => {
    refreshViewportLabels().catch((error) => console.warn('[NAV viewport labels]', error));
  }, 120);
}

function compactItemToFeature(item) {
  return {
    type: 'Feature',
    id: item[0],
    properties: {
      id: item[0], name: item[1], display_name: item[1], kind: item[4], tier: 'custom',
      minzoom: item[5], priority: item[6], context: item[7] || '', category: item[8] || '', render: 1
    },
    geometry: { type: 'Point', coordinates: [item[2], item[3]] }
  };
}

function setNativeCustomLabels(items) {
  const source = map?.getSource('nav-custom-label-source');
  if (!source) return;
  source.setData({ type: 'FeatureCollection', features: items.map(compactItemToFeature) });
}

function nativeFeatureToItem(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const id = String(properties.id || feature.id || '').trim();
  const name = String(properties.name || properties.display_name || '').trim();
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!id || !name || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [
    id, name, lng, lat, String(properties.kind || 'poi'),
    Number(properties.minzoom) || 12, Number(properties.priority) || 50,
    String(properties.context || ''), String(properties.category || '')
  ];
}

function nativeLabelAtPoint(point) {
  if (!map) return null;
  const layers = NATIVE_LABEL_LAYER_IDS.filter((id) => map.getLayer(id));
  if (!layers.length) return null;
  const feature = map.queryRenderedFeatures(point, { layers })[0];
  if (!feature) return null;
  const id = String(feature.properties?.id || feature.id || '');
  return itemById.get(id) || nativeFeatureToItem(feature);
}

function setLoadingProgress(percent, message) {
  const overlay = q('#nav-map-loading');
  if (!overlay || loaderHidden) return;
  const bar = q('#nav-map-loading-bar');
  const text = q('#nav-map-loading-text');
  if (bar) bar.style.width = `${clamp(percent, 0, 100)}%`;
  if (text) text.textContent = message;
}

function hideMapLoading() {
  const overlay = q('#nav-map-loading');
  if (!overlay || loaderHidden) return;
  loaderHidden = true;
  overlay.classList.add('ready');
  window.setTimeout(() => overlay.remove(), 500);
}

function failMapLoading(error) {
  const overlay = q('#nav-map-loading');
  if (!overlay) return;
  const text = q('#nav-map-loading-text');
  const card = overlay.querySelector('.nav-map-loading-card');
  if (text) text.textContent = 'هەندێ داتای ورد دوای کردنەوە بار دەبێت؛ نەخشە بەردەوامە.';
  const bar = q('#nav-map-loading-bar');
  if (bar) bar.style.width = '100%';
  if (card && !card.querySelector('.nav-map-retry')) {
    const button = document.createElement('button');
    button.className = 'nav-map-retry';
    button.type = 'button';
    button.textContent = 'دووبارە هەوڵدانەوە';
    button.addEventListener('click', () => window.location.reload());
    card.appendChild(button);
  }
  console.error('[NAV map loading]', error);
  window.setTimeout(hideMapLoading, 1800);
}

async function ensureProjectFont() {
  const loadFamily = async (family) => {
    if (document.fonts?.check?.(`16px "${family}"`)) return true;
    if (!window.FontFace || !document.fonts?.add) return false;
    const face = new FontFace(family, `url("${LABEL_FONT_URL}") format("truetype")`, {
      style: 'normal', weight: '400', display: 'swap'
    });
    const loaded = await face.load();
    document.fonts.add(loaded);
    return document.fonts.check(`16px "${family}"`);
  };
  const results = await Promise.allSettled([
    loadFamily(LABEL_FONT_FAMILY),
    document.fonts?.load?.(`16px "Qalla Hewal"`) || true
  ]);
  await document.fonts?.ready;
  return results.some((result) => result.status === 'fulfilled' && result.value !== false);
}

async function verifyNativeLabelVisibility() {
  const coreLayerIds = nativeLabelDefinitions
    .filter((definition) => definition.source === 'nav-label-core')
    .map((definition) => definition.id)
    .filter((id) => map?.getLayer(id));
  if (!coreLayerIds.length) throw new Error('core label layers are unavailable');
  await waitForSourceLoaded('nav-label-core', 12000);
  await waitForMapIdle(3500);
  const expectedResponse = await fetch(assetUrl('labels-core.geojson'), { cache: 'force-cache' });
  const expectedCollection = expectedResponse.ok ? await expectedResponse.json() : emptyFeatureCollection();
  const expectedCount = Array.isArray(expectedCollection.features) ? expectedCollection.features.length : 0;
  const sourceFeatures = map.querySourceFeatures('nav-label-core');
  let rendered = map.queryRenderedFeatures(undefined, { layers: coreLayerIds });
  if (expectedCount && !rendered.length) {
    labelFontFallbackActive = true;
    for (const id of NATIVE_LABEL_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'text-font', SAFE_LABEL_FONT_STACK);
    }
    map.triggerRepaint();
    await waitForMapIdle(3000);
    rendered = map.queryRenderedFeatures(undefined, { layers: coreLayerIds });
  }
  if (expectedCount && !rendered.length) {
    throw new Error(`native labels failed: expected=${expectedCount} sourceTiles=${sourceFeatures.length}`);
  }
  return { expected: expectedCount, source: sourceFeatures.length, rendered: rendered.length, fallback: labelFontFallbackActive };
}

async function ensureRtlSupport() {
  if (!window.maplibregl?.setRTLTextPlugin) throw new Error('MapLibre RTL API is unavailable');
  const status = window.maplibregl.getRTLTextPluginStatus?.();
  if (status === 'loaded') return;
  if (status === 'loading') {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const next = window.maplibregl.getRTLTextPluginStatus?.();
      if (next === 'loaded') return;
      if (next === 'error') throw new Error('RTL text plugin failed');
    }
    throw new Error('RTL text plugin timeout');
  }
  await window.maplibregl.setRTLTextPlugin(RTL_PLUGIN_URL, false);
  const finalStatus = window.maplibregl.getRTLTextPluginStatus?.();
  if (finalStatus && finalStatus !== 'loaded') throw new Error(`RTL plugin status: ${finalStatus}`);
}

function waitForSourceLoaded(sourceId, timeout = 10000) {
  return new Promise((resolve) => {
    if (map?.getSource(sourceId) && map.isSourceLoaded(sourceId)) {
      resolve(true);
      return;
    }
    const timer = window.setTimeout(() => {
      map?.off('sourcedata', onSourceData);
      resolve(false);
    }, timeout);
    function onSourceData(event) {
      if (event.sourceId !== sourceId) return;
      if (!map?.getSource(sourceId) || !map.isSourceLoaded(sourceId)) return;
      window.clearTimeout(timer);
      map.off('sourcedata', onSourceData);
      resolve(true);
    }
    map.on('sourcedata', onSourceData);
  });
}

function waitForMapIdle(timeout = 12000) {
  return new Promise((resolve) => {
    if (map?.loaded() && !map.isMoving()) {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    const timer = window.setTimeout(() => {
      map?.off('idle', done);
      resolve();
    }, timeout);
    function done() {
      window.clearTimeout(timer);
      map.off('idle', done);
      resolve();
    }
    map.on('idle', done);
  });
}

function installMapUi() {
  const mapView = q('#view-map');
  q('#leafmap')?.setAttribute('lang', 'ckb');
  if (!q('#nav-map-loading')) {
    const loading = document.createElement('div');
    loading.id = 'nav-map-loading';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.innerHTML = '<div class="nav-map-loading-card"><div class="nav-map-spinner" aria-hidden="true"></div><b>نەخشەی کوردستان خەریکە ئامادە دەبێت</b><small id="nav-map-loading-text">پشکنینی فۆنت و زمانی کوردی…</small><div class="nav-map-progress"><i id="nav-map-loading-bar"></i></div></div>';
    mapView.appendChild(loading);
  }
  const mapTop = q('#map-top');
  if (!q('#nav-map-results')) {
    const results = document.createElement('div');
    results.id = 'nav-map-results';
    mapTop.appendChild(results);
  }
  if (!q('#nav-route-panel')) {
    const panel = document.createElement('div');
    panel.id = 'nav-route-panel';
    panel.innerHTML = '<div class="route-copy"><b id="nav-route-name"></b><small id="nav-route-meta">ئامادەی ڕێنوێنی GPS</small></div><button class="nav-route-btn" id="nav-route-go">GPS</button><button class="nav-route-close" id="nav-route-close" aria-label="داخستن">×</button>';
    mapTop.appendChild(panel);
    q('#nav-route-go').addEventListener('click', () => routeToSelected({ fit: true }));
    q('#nav-route-close').addEventListener('click', clearDestination);
  }
  if (!q('#nav-data-state')) {
    const status = document.createElement('div');
    status.id = 'nav-data-state';
    q('#view-map').appendChild(status);
  }
  const input = q('#map-search');
  input.placeholder = 'گەڕان بۆ شار، گوند، دوکان یان شوێن...';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'گەڕان لە نەخشەی کوردستان');
  q('#btn-layers').title = '٣D / دوو ڕەهەندی';
  q('#btn-locate').title = 'GPS و شوێنی من';
  q('#map-card').style.display = 'none';
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#nav-map-results') && !event.target.closest('#map-search')) hideSearchResults();
  });
}

function setStatus(message, milliseconds = 2300) {
  const element = q('#nav-data-state');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => element.classList.remove('show'), milliseconds);
}

function hideSearchResults() {
  q('#nav-map-results')?.classList.remove('show');
}

function sanitizeItems(items) {
  const seenIds = new Set();
  const accepted = [];
  for (const raw of items || []) {
    if (!Array.isArray(raw) || raw.length < 7) continue;
    const item = [...raw];
    item[0] = String(item[0] || '').trim();
    item[1] = String(item[1] || '').trim();
    item[2] = Number(item[2]);
    item[3] = Number(item[3]);
    item[5] = Number(item[5]);
    item[6] = Number(item[6]);
    if (!item[0] || !item[1] || seenIds.has(item[0])) continue;
    if (!Number.isFinite(item[2]) || !Number.isFinite(item[3]) || !Number.isFinite(item[5]) || !Number.isFinite(item[6])) continue;
    if (!pointInBoundary(item[2], item[3])) continue;
    seenIds.add(item[0]);
    accepted.push(item);
  }
  return accepted;
}

function rebuildSearchIndex() {
  itemById = new Map(allItems.map((item) => [String(item[0]), item]));
  searchIndex = allItems.map((item) => ({
    item,
    name: normalizeText(item[1]),
    context: normalizeText(`${item[7] || ''} ${item[8] || ''}`)
  }));
}

function searchItems(query) {
  const needle = normalizeText(query);
  const box = q('#nav-map-results');
  if (!box) return;
  if (needle.length < 2) {
    box.innerHTML = '';
    box.classList.remove('show');
    return;
  }
  if (!searchIndex.length) {
    box.innerHTML = '<div class="nav-search-item"><div class="nav-search-copy"><b>داتای گەڕان خەریکە بار دەبێت</b><small>دوای چرکەیەک دووبارە بنووسە</small></div></div>';
    box.classList.add('show');
    return;
  }
  const matches = [];
  for (const entry of searchIndex) {
    const { item, name, context } = entry;
    let score = 0;
    if (name === needle) score = 1000;
    else if (name.startsWith(needle)) score = 700;
    else if (name.includes(needle)) score = 480;
    else if (context.includes(needle)) score = 220;
    if (score) matches.push([score + item[6] / 20 - item[5], item]);
  }
  matches.sort((a, b) => b[0] - a[0]);
  const top = matches.slice(0, 12).map((entry) => entry[1]);
  if (!top.length) {
    box.innerHTML = '<div class="nav-search-item"><div class="nav-search-copy"><b>هیچ شوێنێک نەدۆزرایەوە</b><small>ناوەکە بە شێوازێکی تر بنووسە</small></div></div>';
  } else {
    box.innerHTML = top.map((item) => `<button class="nav-search-item" data-nav-result="${escapeHtml(item[0])}"><div class="nav-search-copy"><b>${escapeHtml(item[1])}</b><small>${escapeHtml(item[7] || item[8] || kindNames[item[4]] || '')}</small></div><span class="nav-search-kind">${escapeHtml(kindNames[item[4]] || 'شوێن')}</span></button>`).join('');
    box.querySelectorAll('[data-nav-result]').forEach((button) => button.addEventListener('click', () => {
      const item = itemById.get(String(button.dataset.navResult));
      if (item) selectDestination(item);
    }));
  }
  box.classList.add('show');
}

function setSourcePoint(sourceId, coordinates, properties = {}) {
  const source = map?.getSource(sourceId);
  if (!source) return;
  source.setData(coordinates ? pointFeature(coordinates, properties) : emptyFeatureCollection());
}

function selectDestination(item) {
  if (!pointInBoundary(item[2], item[3])) {
    toast('ئەم شوێنە لە دەرەوەی سنووری کارپێکردنی نەخشەیە');
    return;
  }
  selectedDestination = item;
  setSourcePoint('nav-destination', [item[2], item[3]], { id: item[0] });
  hideSearchResults();
  q('#map-search').value = item[1];
  q('#nav-route-name').textContent = item[1];
  q('#nav-route-meta').textContent = item[7] || item[8] || 'ئامادەی ڕێنوێنی GPS';
  q('#nav-route-panel').classList.add('show');
  map.flyTo({ center: [item[2], item[3]], zoom: Math.max(13, map.getZoom()), duration: 900, essential: true });
}

function clearDestination() {
  selectedDestination = null;
  q('#nav-route-panel')?.classList.remove('show');
  q('#map-search').value = '';
  setSourcePoint('nav-destination', null);
  map?.getSource('nav-route')?.setData(emptyFeatureCollection());
  routeLastOrigin = null;
}

function metersPerPixel(latitude, zoom) {
  return Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137 / (512 * 2 ** zoom);
}

function updateGpsAccuracyPaint() {
  if (!map || !gpsState?.accuracy || !currentPosition || !map.getLayer('nav-gps-accuracy')) return;
  const radius = clamp(gpsState.accuracy / metersPerPixel(currentPosition[1], map.getZoom()), 8, 180);
  map.setPaintProperty('nav-gps-accuracy', 'circle-radius', radius);
}

function filterGpsFix(position) {
  const raw = [Number(position.coords.longitude), Number(position.coords.latitude)];
  const accuracy = clamp(Number(position.coords.accuracy) || 999, 1, 5000);
  const timestamp = Number(position.timestamp) || Date.now();
  if (!Number.isFinite(raw[0]) || !Number.isFinite(raw[1])) return null;
  if (Math.abs(raw[0]) > 180 || Math.abs(raw[1]) > 90) return null;

  if (!gpsState) {
    gpsState = { coordinates: raw, accuracy, timestamp, rejected: 0 };
    return gpsState;
  }

  const elapsedSeconds = clamp((timestamp - gpsState.timestamp) / 1000, 0.05, 120);
  const distance = haversineMeters(gpsState.coordinates, raw);
  const reportedSpeed = Number(position.coords.speed);
  const plausibleSpeed = Number.isFinite(reportedSpeed) && reportedSpeed >= 0 ? Math.max(45, reportedSpeed * 2.2) : 65;
  const plausibleDistance = plausibleSpeed * elapsedSeconds + accuracy * 2.5 + gpsState.accuracy * 1.5 + 40;
  if (elapsedSeconds < 30 && distance > plausibleDistance) {
    gpsState.rejected += 1;
    return null;
  }
  if (accuracy > 800 && gpsState.accuracy < 150) {
    gpsState.rejected += 1;
    return null;
  }

  const stationaryThreshold = Math.max(2.5, Math.min(accuracy, gpsState.accuracy) * 0.18);
  let coordinates = raw;
  if (distance <= stationaryThreshold && accuracy >= gpsState.accuracy * 0.7) {
    coordinates = gpsState.coordinates;
  } else {
    const accuracyWeight = gpsState.accuracy / (gpsState.accuracy + accuracy);
    let alpha = clamp(0.18 + accuracyWeight * 0.5 + elapsedSeconds / 80, 0.18, 0.78);
    if (accuracy < gpsState.accuracy * 0.55) alpha = Math.max(alpha, 0.72);
    coordinates = [
      gpsState.coordinates[0] + (raw[0] - gpsState.coordinates[0]) * alpha,
      gpsState.coordinates[1] + (raw[1] - gpsState.coordinates[1]) * alpha
    ];
  }

  gpsState = {
    coordinates,
    accuracy: Math.min(accuracy, gpsState.accuracy * 0.7 + accuracy * 0.3),
    timestamp,
    rejected: gpsState.rejected
  };
  return gpsState;
}

function updateGpsOnMap(state, center) {
  currentPosition = state.coordinates;
  setSourcePoint('nav-gps', currentPosition, { accuracy: state.accuracy });
  updateGpsAccuracyPaint();
  if (center) map.flyTo({ center: currentPosition, zoom: Math.max(15.5, map.getZoom()), duration: 900, essential: true });
}

function startGps({ center = true } = {}) {
  if (!navigator.geolocation) {
    toast('GPS لەم ئامێرە بەردەست نییە');
    return;
  }
  if (gpsWatchId !== null) {
    if (center && currentPosition) map.flyTo({ center: currentPosition, zoom: Math.max(15, map.getZoom()), duration: 700 });
    return;
  }
  setStatus('GPS خەریکە شوێنت دەدۆزێتەوە…', 4000);
  let firstAccepted = true;
  gpsWatchId = navigator.geolocation.watchPosition((position) => {
    const state = filterGpsFix(position);
    if (!state) return;
    updateGpsOnMap(state, center && firstAccepted);
    firstAccepted = false;
    const accuracy = Math.round(state.accuracy);
    setStatus(`GPS چالاکە · وردی نزیکەیی ${accuracy} م`, 1800);
    if (selectedDestination) {
      const moved = routeLastOrigin ? haversineMeters(routeLastOrigin, currentPosition) : Infinity;
      if (moved >= 25 && Date.now() - routeLastAt > 20000) routeToSelected({ silent: true, fit: false });
    }
  }, (error) => {
    gpsWatchId = null;
    const message = error.code === 1 ? 'ڕێگەپێدانی GPS پێویستە' : 'شوێنی GPS بەدەست نەهات';
    toast(message);
  }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 18000 });
}

function validateRouteGeometry(route, origin, destination) {
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;
  if (!coordinates.every((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))) return false;
  if (haversineMeters(coordinates[0], origin) > 2500) return false;
  if (haversineMeters(coordinates[coordinates.length - 1], destination) > 2500) return false;
  const direct = haversineMeters(origin, destination);
  if (!Number.isFinite(route.distance) || route.distance < direct * 0.75 || route.distance > direct * 12 + 150000) return false;
  return true;
}

async function routeToSelected(options = {}) {
  if (!selectedDestination) return;
  if (!currentPosition) {
    startGps({ center: true });
    toast('دوای دیاریکردنی شوێنت، دووبارە GPS دابگرە');
    return;
  }
  if (!pointInBoundary(currentPosition[0], currentPosition[1])) {
    toast('شوێنی ئێستات لە دەرەوەی سنووری نەخشەیە');
    return;
  }
  if (routeBusy && options.silent) return;
  if (routeAbortController) routeAbortController.abort();
  routeAbortController = new AbortController();
  routeBusy = true;
  q('#nav-route-go').disabled = true;
  if (!options.silent) q('#nav-route-meta').textContent = 'خەریکە ڕێگا دەدۆزرێتەوە…';
  try {
    const origin = [...currentPosition];
    const destination = [selectedDestination[2], selectedDestination[3]];
    const url = `${ROUTING_BASE}/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: routeAbortController.signal
    });
    if (!response.ok) throw new Error(`route HTTP ${response.status}`);
    const data = await response.json();
    const route = data.routes?.[0];
    if (!validateRouteGeometry(route, origin, destination)) throw new Error('invalid route geometry');
    map.getSource('nav-route').setData({ type: 'Feature', properties: {}, geometry: route.geometry });
    const kilometers = route.distance / 1000;
    const minutes = Math.round(route.duration / 60);
    q('#nav-route-meta').textContent = `${kilometers.toFixed(kilometers < 10 ? 1 : 0)} کم · نزیکەی ${minutes} خولەک`;
    routeLastAt = Date.now();
    routeLastOrigin = origin;
    if (options.fit !== false) {
      const coordinates = route.geometry.coordinates;
      const bounds = coordinates.reduce(
        (value, coordinate) => value.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: { top: 150, bottom: 145, left: 55, right: 55 }, duration: 900 });
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.warn('[NAV route]', error);
      if (!options.silent) {
        q('#nav-route-meta').textContent = 'ڕێگا بەدەست نەهات';
        toast('خزمەتی ڕێنوێنی لەم کاتەدا بەردەست نییە');
      }
    }
  } finally {
    routeBusy = false;
    q('#nav-route-go').disabled = false;
  }
}

async function toggle3D() {
  if (!map) return;
  if (!MAPTILER_KEY || !map.getSource('terrain')) {
    toast('بۆ ٣D، VITE_MAPTILER_KEY لە GitHub Actions زیاد بکە');
    return;
  }
  terrainEnabled = !terrainEnabled;
  if (terrainEnabled) {
    map.setTerrain({ source: 'terrain', exaggeration: 1.35 });
    map.easeTo({ pitch: 58, bearing: -10, duration: 850 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }
  q('#btn-layers').classList.toggle('nav-3d-on', terrainEnabled);
  toast(terrainEnabled ? 'دیمەنی ٣D چالاک کرا' : 'دیمەنی دوو ڕەهەندی چالاک کرا');
}

async function loadDeferredCatalog() {
  try {
    const labelsResponse = await fetch(assetUrl('labels.compact.json'), { cache: 'force-cache' });
    if (!labelsResponse.ok) throw new Error(`label catalog HTTP ${labelsResponse.status}`);
    const labels = await labelsResponse.json();
    allItems = sanitizeItems(labels.items || []);
    rebuildSearchIndex();

    const databaseItems = sanitizeItems(await loadPublishedPlaces());
    if (databaseItems.length) {
      const existingIds = new Set(allItems.map((item) => String(item[0])));
      pendingCustomItems = databaseItems.filter((item) => !existingIds.has(String(item[0])));
      allItems.push(...pendingCustomItems);
      rebuildSearchIndex();
      if (map?.getSource('nav-custom-label-source')) setNativeCustomLabels(pendingCustomItems);
    }
    return { count: allItems.length, custom: pendingCustomItems.length };
  } catch (error) {
    console.warn('[NAV deferred catalog]', error);
    return { count: allItems.length, custom: 0, error };
  }
}

async function createMap() {
  loaderHidden = false;
  installMapUi();
  configureMapWorkers();
  setLoadingProgress(6, 'پشکنینی فۆنت و ڕێکخستنی زمانی کوردی…');

  const fontPromise = ensureProjectFont();
  const rtlPromise = ensureRtlSupport();

  const [boundaryResponse, maskResponse] = await Promise.all([
    fetch(assetUrl('boundary.geojson'), { cache: 'force-cache' }),
    fetch(assetUrl('outside-mask.geojson'), { cache: 'force-cache' })
  ]);
  if (!boundaryResponse.ok || !maskResponse.ok) throw new Error('NAV boundary files failed to load');
  const boundary = await boundaryResponse.json();
  const mask = await maskResponse.json();
  boundaryGeometry = boundary.features?.[0]?.geometry || null;
  const bbox = geometryBbox(boundaryGeometry);

  setLoadingProgress(18, 'فۆنت و نووسینی ڕاست‌بۆچەپ خەریکە ئامادە دەبێت…');
  const [fontResult, rtlResult] = await Promise.allSettled([
    withTimeout(fontPromise, 7000, false),
    withTimeout(rtlPromise, 9000, false)
  ]);
  if (fontResult.status === 'rejected') console.warn('[NAV font]', fontResult.reason);
  if (rtlResult.status === 'rejected') console.warn('[NAV RTL]', rtlResult.reason);

  setLoadingProgress(30, 'بنەمای ساتەلایت و سنووری کوردستان بار دەبێت…');
  map = new maplibregl.Map({
    container: 'leafmap',
    style: baseStyle(boundary, mask),
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: 6.2,
    minZoom: 5.1,
    maxZoom: 19.25,
    maxPitch: 60,
    renderWorldCopies: false,
    pitchWithRotate: true,
    dragRotate: true,
    touchPitch: true,
    attributionControl: true,
    antialias: false,
    fadeDuration: 0,
    crossSourceCollisions: true,
    refreshExpiredTiles: false,
    preserveDrawingBuffer: false,
    maxBounds: [[bbox[0] - 1.25, bbox[1] - 1], [bbox[2] + 1.25, bbox[3] + 1]]
  });

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('map load timeout')), 30000);
    map.once('load', () => {
      window.clearTimeout(timer);
      resolve();
    });
    map.on('error', (event) => console.warn('[NAV map resource]', event.error || event));
  });

  setLoadingProgress(52, 'ناوی شار و ناوچە سەرەکییەکان ئامادە دەبن…');
  installNativeLabelLayers();
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 28, duration: 0 });
  map.on('zoom', updateGpsAccuracyPaint);
  map.on('moveend', scheduleViewportLabels);
  map.on('zoomend', scheduleViewportLabels);
  map.on('click', (event) => {
    const label = nativeLabelAtPoint(event.point);
    if (label) {
      selectDestination(label);
      return;
    }
    if (!pointInBoundary(event.lngLat.lng, event.lngLat.lat)) toast('دەرەوەی سنووری کارپێکردنی نەخشە داخراوە');
  });

  const labelHealth = await verifyNativeLabelVisibility();
  if (labelHealth.fallback) console.warn('[NAV font] embedded font unavailable to WebGL text renderer; safe local fallback enabled');
  setLoadingProgress(76, 'ناوە وردەکان بەپێی شوێنی بینین بار دەبن…');
  await withTimeout(refreshViewportLabels({ force: true }), 7000, { count: 0, timeout: true });

  setLoadingProgress(94, 'کۆتا پشکنینی tile و ماسک…');
  await waitForMapIdle(6500);
  setLoadingProgress(100, 'نەخشە ئامادەیە');
  window.setTimeout(hideMapLoading, 140);

  window.setTimeout(() => {
    catalogPromise = loadDeferredCatalog().then((catalog) => {
      setStatus(`${Number(catalog?.count || allItems.length).toLocaleString('en-US')} ناوی شوێن و گەڕان ئامادەیە`, 3000);
      return catalog;
    });
  }, 450);
  return map;
}

function init() {
  if (!mapReadyPromise) {
    mapReadyPromise = createMap().catch((error) => {
      console.error('[NAV map init]', error);
      mapReadyPromise = null;
      failMapLoading(error);
      toast('نەخشە بە بەشی سەرەکی کراوەتەوە؛ داتای ورد دوایەوە بار دەبێت');
      return map;
    });
  }
  return mapReadyPromise;
}

window.navKurdMapInit = init;
window.navKurdMapResize = () => {
  if (map) map.resize();
};
window.navKurdMapSearch = (value) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => searchItems(value), 90);
};
window.navKurdToggle3D = () => init().then(toggle3D);
window.navKurdLocate = () => init().then(() => startGps({ center: true }));
window.navKurdZoom = (direction) => init().then(() => map.easeTo({ zoom: map.getZoom() + direction, duration: 280 }));
