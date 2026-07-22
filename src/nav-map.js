import { loadPublishedPlaces } from './backend.js';

const DATA_BASE = new URL('../data/nav/', import.meta.url).href.replace(/\/$/, '');
const CONFIG = window.__APP_CONFIG__ || {};
const MAPTILER_KEY = String(CONFIG.VITE_MAPTILER_KEY || '').trim();
const ROUTING_BASE = String(CONFIG.VITE_ROUTING_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const EARTH_RADIUS_M = 6371008.8;
const LABEL_FONT_STACK = ['Qalla Hewal', 'Noto Sans Arabic', 'sans-serif'];
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

const q = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toast = (message) => {
  if (typeof window.toast === 'function') window.toast(message);
  else console.info('[NAV]', message);
};
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

function esriSatelliteSource() {
  return {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics'
  };
}

function baseStyle() {
  const sources = { 'satellite-fallback': esriSatelliteSource() };
  const layers = [{
    id: 'satellite-fallback',
    type: 'raster',
    source: 'satellite-fallback',
    minzoom: 0,
    maxzoom: 24,
    paint: { 'raster-fade-duration': 0 }
  }];

  if (MAPTILER_KEY) {
    sources['satellite-maptiler'] = {
      type: 'raster',
      url: `https://api.maptiler.com/tiles/satellite-v4/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      tileSize: 256
    };
    sources.terrain = {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      tileSize: 256
    };
    layers.push({
      id: 'satellite-maptiler',
      type: 'raster',
      source: 'satellite-maptiler',
      minzoom: 0,
      maxzoom: 24,
      paint: { 'raster-fade-duration': 0, 'raster-opacity': 1 }
    });
  }

  return { version: 8, sources, layers, transition: { duration: 0, delay: 0 } };
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

function addRuntimeLayers(boundary, mask) {
  map.addSource('nav-outside', { type: 'geojson', data: mask });
  map.addSource('nav-boundary', { type: 'geojson', data: boundary });
  map.addLayer({
    id: 'nav-outside-dark',
    type: 'fill',
    source: 'nav-outside',
    paint: { 'fill-color': '#030712', 'fill-opacity': 0.84 }
  });
  map.addLayer({
    id: 'nav-boundary-line',
    type: 'line',
    source: 'nav-boundary',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#f5c66b',
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2.2, 15, 3.2],
      'line-opacity': 0.86
    }
  });

  map.addSource('nav-route', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'nav-route-casing',
    type: 'line',
    source: 'nav-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#071426',
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 5, 13, 8, 18, 12],
      'line-opacity': 0.92
    }
  });
  map.addLayer({
    id: 'nav-route-line',
    type: 'line',
    source: 'nav-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#2e7cf6',
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 13, 5, 18, 8],
      'line-opacity': 0.98
    }
  });

  map.addSource('nav-destination', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
    id: 'nav-destination-halo',
    type: 'circle',
    source: 'nav-destination',
    paint: { 'circle-radius': 11, 'circle-color': '#f5b366', 'circle-opacity': 0.2 }
  });
  map.addLayer({
    id: 'nav-destination-dot',
    type: 'circle',
    source: 'nav-destination',
    paint: {
      'circle-radius': 5,
      'circle-color': '#f5b366',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  });

  map.addSource('nav-gps', { type: 'geojson', data: emptyFeatureCollection() });
  map.addLayer({
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
  });
  map.addLayer({
    id: 'nav-gps-halo',
    type: 'circle',
    source: 'nav-gps',
    paint: { 'circle-radius': 13, 'circle-color': '#2e7cf6', 'circle-opacity': 0.24 }
  });
  map.addLayer({
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
  });
  map.addLayer({
    id: 'nav-gps-dot',
    type: 'circle',
    source: 'nav-gps',
    paint: { 'circle-radius': 6, 'circle-color': '#2e7cf6', 'circle-opacity': 1 }
  });
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
  { id: 'nav-label-region', tier: 'region', minzoom: 5.0, maxzoom: 9.4, size: ['interpolate', ['linear'], ['zoom'], 5, 16, 8, 22], color: '#ffe39a', halo: 2.4, overlap: true },
  { id: 'nav-label-governorate', tier: 'governorate', minzoom: 5.8, maxzoom: 10.4, size: ['interpolate', ['linear'], ['zoom'], 5.8, 12, 9.5, 16], color: '#fff0be', halo: 2.1, overlap: true },
  { id: 'nav-label-city', tier: 'city', minzoom: 6.2, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 6.2, 12, 10, 15, 16, 18], color: '#ffffff', halo: 2.2, overlap: true },
  { id: 'nav-label-town', tier: 'town', minzoom: 8.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 8, 10.5, 13, 13.5, 17, 15], color: '#ffffff', halo: 2.0, overlap: false },
  { id: 'nav-label-locality', tier: 'locality', minzoom: 10.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 10, 9.5, 15, 12, 18, 13], color: '#f4f7fb', halo: 1.8, overlap: false },
  { id: 'nav-label-natural', tier: 'natural', minzoom: 10.5, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 10.5, 9.5, 15, 11.5, 18, 13], color: '#c8f5dc', halo: 1.8, overlap: false },
  { id: 'nav-label-road', tier: 'road', minzoom: 12.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 12, 9, 16, 11, 19, 12], color: '#ffe0a1', halo: 1.7, overlap: false },
  { id: 'nav-label-poi-landmark', tier: 'poi_landmark', minzoom: 9.2, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 9.2, 9.5, 14, 11.5, 18, 13], color: '#ffffff', halo: 1.9, overlap: false },
  { id: 'nav-label-poi-regional', tier: 'poi_regional', minzoom: 11.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 11, 9.2, 15, 11.2, 18, 12.5], color: '#ffffff', halo: 1.8, overlap: false },
  { id: 'nav-label-poi-local', tier: 'poi_local', minzoom: 13.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 13, 9, 17, 11.2, 20, 12.5], color: '#ffffff', halo: 1.7, overlap: false },
  { id: 'nav-label-poi-detail', tier: 'poi_detail', minzoom: 15.0, maxzoom: 20, size: ['interpolate', ['linear'], ['zoom'], 15, 8.8, 18, 10.8, 20, 12], color: '#ffffff', halo: 1.6, overlap: false }
];

function nativeLabelLayout(definition) {
  return {
    'symbol-placement': 'point',
    'symbol-z-order': 'source',
    'symbol-sort-key': ['-', 0, ['to-number', ['get', 'priority']]],
    'text-field': ['coalesce', ['get', 'display_name'], ['get', 'name']],
    'text-font': LABEL_FONT_STACK,
    'text-size': definition.size,
    'text-anchor': 'center',
    'text-justify': 'center',
    'text-offset': [0, 0],
    'text-max-width': 14,
    'text-line-height': 1.05,
    'text-padding': definition.overlap ? 1 : 2,
    'text-allow-overlap': definition.overlap,
    'text-ignore-placement': false,
    'text-optional': false,
    'text-rotation-alignment': 'viewport',
    'text-pitch-alignment': 'viewport',
    'text-keep-upright': true
  };
}

function nativeLabelPaint(definition) {
  return {
    'text-color': definition.color,
    'text-opacity': 1,
    'text-halo-color': 'rgba(1,6,18,0.97)',
    'text-halo-width': definition.halo,
    'text-halo-blur': 0.25
  };
}

function installNativeLabelLayers() {
  map.addSource('nav-label-source', {
    type: 'geojson',
    data: `${DATA_BASE}/labels-native.geojson`,
    promoteId: 'id',
    cluster: false,
    tolerance: 0,
    buffer: 128,
    maxzoom: 19
  });
  for (const definition of nativeLabelDefinitions) {
    map.addLayer({
      id: definition.id,
      type: 'symbol',
      source: 'nav-label-source',
      minzoom: definition.minzoom,
      maxzoom: definition.maxzoom,
      filter: ['all', ['==', ['get', 'render'], 1], ['==', ['get', 'tier'], definition.tier]],
      layout: nativeLabelLayout(definition),
      paint: nativeLabelPaint(definition)
    });
  }
  map.addSource('nav-custom-label-source', { type: 'geojson', data: emptyFeatureCollection(), promoteId: 'id', cluster: false, tolerance: 0, buffer: 128, maxzoom: 19 });
  map.addLayer({
    id: 'nav-label-custom',
    type: 'symbol',
    source: 'nav-custom-label-source',
    minzoom: 11.5,
    maxzoom: 20,
    layout: nativeLabelLayout({ size: ['interpolate', ['linear'], ['zoom'], 11.5, 9.5, 16, 11.5, 19, 13], overlap: false }),
    paint: nativeLabelPaint({ color: '#ffffff', halo: 1.9 })
  });
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

function installMapUi() {
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
    const labelsResponse = await fetch(`${DATA_BASE}/labels.compact.json`);
    if (!labelsResponse.ok) throw new Error(`label catalog HTTP ${labelsResponse.status}`);
    const labels = await labelsResponse.json();
    allItems = sanitizeItems(labels.items || []);
    rebuildSearchIndex();

    const databaseItems = sanitizeItems(await loadPublishedPlaces());
    if (databaseItems.length) {
      const existingIds = new Set(allItems.map((item) => String(item[0])));
      const uniqueDatabaseItems = databaseItems.filter((item) => !existingIds.has(String(item[0])));
      allItems.push(...uniqueDatabaseItems);
      setNativeCustomLabels(uniqueDatabaseItems);
      rebuildSearchIndex();
    }
    setStatus(`${allItems.length.toLocaleString('en-US')} ناوی شوێن و گەڕان ئامادەیە`, 3000);
  } catch (error) {
    console.warn('[NAV deferred catalog]', error);
    toast('گەڕان هێشتا ئامادە نییە؛ نەخشە بەردەوام کار دەکات');
  }
}

async function createMap() {
  installMapUi();
  const [boundaryResponse, maskResponse] = await Promise.all([
    fetch(`${DATA_BASE}/boundary.geojson`),
    fetch(`${DATA_BASE}/outside-mask.geojson`)
  ]);
  if (!boundaryResponse.ok || !maskResponse.ok) throw new Error('NAV boundary files failed to load');
  const boundary = await boundaryResponse.json();
  const mask = await maskResponse.json();
  boundaryGeometry = boundary.features?.[0]?.geometry || null;
  const bbox = geometryBbox(boundaryGeometry);

  if (document.fonts?.load) {
    try { await document.fonts.load('12px \"Qalla Hewal\"'); } catch { /* browser font fallback remains available */ }
  }

  map = new maplibregl.Map({
    container: 'leafmap',
    style: baseStyle(),
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: 6.2,
    minZoom: 5.1,
    maxZoom: 19,
    pitchWithRotate: true,
    dragRotate: true,
    touchPitch: true,
    attributionControl: true,
    antialias: true,
    fadeDuration: 0,
    crossSourceCollisions: true,
    maxBounds: [[bbox[0] - 1.25, bbox[1] - 1], [bbox[2] + 1.25, bbox[3] + 1]]
  });

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('map load timeout')), 25000);
    map.once('load', () => {
      window.clearTimeout(timer);
      resolve();
    });
    map.on('error', (event) => console.warn('[NAV map resource]', event.error || event));
  });

  // Labels are installed as native MapLibre symbol layers before the outside mask.
  // The mask therefore clips any glyph pixels that cross the canonical boundary.
  installNativeLabelLayers();
  addRuntimeLayers(boundary, mask);
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 28, duration: 0 });
  map.on('zoom', updateGpsAccuracyPaint);
  map.on('click', (event) => {
    const label = nativeLabelAtPoint(event.point);
    if (label) {
      selectDestination(label);
      return;
    }
    if (!pointInBoundary(event.lngLat.lng, event.lngLat.lat)) toast('دەرەوەی سنووری کارپێکردنی نەخشە داخراوە');
  });

  map.on('sourcedata', (event) => {
    if (event.sourceId === 'nav-label-source' && map.isSourceLoaded('nav-label-source')) {
      setStatus('ناوەکانی نەخشە بە شێوەی native ئامادەن', 2200);
    }
  });

  const scheduleDeferred = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback, { timeout: 1600 })
    : (callback) => window.setTimeout(callback, 250);
  scheduleDeferred(() => { void loadDeferredCatalog(); });
  return map;
}

function init() {
  if (!mapReadyPromise) {
    mapReadyPromise = createMap().catch((error) => {
      console.error('[NAV map init]', error);
      mapReadyPromise = null;
      toast('داتای نەخشە بار نەبوو؛ پەڕەکە نوێ بکەرەوە');
      throw error;
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
