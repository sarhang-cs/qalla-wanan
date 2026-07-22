import { loadPublishedPlaces } from './backend.js';

const DATA_BASE = new URL('../data/nav/', import.meta.url).href.replace(/\/$/, '');
const CONFIG = window.__APP_CONFIG__ || {};
const MAPTILER_KEY = String(CONFIG.VITE_MAPTILER_KEY || '').trim();
const ROUTING_BASE = String(CONFIG.VITE_ROUTING_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const EARTH_RADIUS_M = 6371008.8;

let map = null;
let mapReadyPromise = null;
let labelLayer = null;
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

  return { version: 8, sources, layers };
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

const labelStyles = {
  region: { size: 21, weight: 900, fill: '#ffe39a', halo: 5 },
  governorate: { size: 16, weight: 900, fill: '#fff2c7', halo: 4 },
  city: { size: 15, weight: 900, fill: '#ffffff', halo: 4 },
  town: { size: 14, weight: 850, fill: '#ffffff', halo: 3.5 },
  village: { size: 12, weight: 800, fill: '#ffffff', halo: 3 },
  hamlet: { size: 11, weight: 760, fill: '#f1f5fb', halo: 3 },
  suburb: { size: 11, weight: 760, fill: '#f1f5fb', halo: 3 },
  neighbourhood: { size: 11, weight: 760, fill: '#f1f5fb', halo: 3 },
  locality: { size: 11, weight: 760, fill: '#f1f5fb', halo: 3 },
  natural: { size: 11, weight: 760, fill: '#c8f5dc', halo: 3 },
  road: { size: 10, weight: 730, fill: '#ffe0a1', halo: 3 },
  poi: { size: 10.5, weight: 760, fill: '#ffffff', halo: 3 },
  custom: { size: 10.5, weight: 760, fill: '#ffffff', halo: 3 }
};

class SpatialPointIndex {
  constructor(items, cellDegrees = 0.2) {
    this.cellDegrees = cellDegrees;
    this.buckets = new Map();
    this.rebuild(items);
  }

  key(lng, lat) {
    return `${Math.floor(lng / this.cellDegrees)}:${Math.floor(lat / this.cellDegrees)}`;
  }

  rebuild(items) {
    this.buckets.clear();
    for (const item of items) {
      const key = this.key(item[2], item[3]);
      if (!this.buckets.has(key)) this.buckets.set(key, []);
      this.buckets.get(key).push(item);
    }
  }

  query(bounds, zoom) {
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const minX = Math.floor(west / this.cellDegrees);
    const maxX = Math.floor(east / this.cellDegrees);
    const minY = Math.floor(south / this.cellDegrees);
    const maxY = Math.floor(north / this.cellDegrees);
    const result = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = this.buckets.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (item[5] <= zoom && item[2] >= west && item[2] <= east && item[3] >= south && item[3] <= north) {
            result.push(item);
          }
        }
      }
    }
    return result;
  }
}

class CanvasLabelLayer {
  constructor(mapInstance, items) {
    this.map = mapInstance;
    this.items = items;
    this.index = new SpatialPointIndex(items);
    this.selectedId = null;
    this.hitRects = [];
    this.frame = 0;
    this.lastDrawAt = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nav-label-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.map.getContainer().appendChild(this.canvas);
    this.drawBound = this.scheduleDraw.bind(this);
    this.map.on('render', this.drawBound);
    this.map.on('resize', this.drawBound);
    this.map.on('styledata', this.drawBound);
    this.scheduleDraw();
  }

  append(items) {
    if (!items?.length) return;
    this.items.push(...items);
    this.index.rebuild(this.items);
    this.scheduleDraw();
  }

  setSelected(id) {
    this.selectedId = id || null;
    this.scheduleDraw();
  }

  scheduleDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame((time) => {
      this.frame = 0;
      if (time - this.lastDrawAt < 24 && this.map.isMoving()) {
        this.scheduleDraw();
        return;
      }
      this.lastDrawAt = time;
      this.draw();
    });
  }

  resizeCanvas() {
    const container = this.map.getContainer();
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
  }

  styleFor(item, zoom) {
    const base = labelStyles[item[4]] || labelStyles.poi;
    const selected = item[0] === this.selectedId;
    const zoomBoost = item[4] === 'region' ? 0 : zoom >= 15 ? 1.5 : zoom >= 12 ? 0.5 : 0;
    return {
      size: base.size + zoomBoost + (selected ? 1 : 0),
      weight: base.weight,
      fill: selected ? '#ffe39a' : base.fill,
      halo: base.halo + (selected ? 1 : 0)
    };
  }

  candidates(zoom) {
    const source = this.index.query(this.map.getBounds(), zoom);
    const governorateNames = zoom < 8.2
      ? new Set(source.filter((item) => item[4] === 'governorate').map((item) => normalizeText(item[1])))
      : null;
    const filtered = governorateNames
      ? source.filter((item) => !(item[4] === 'city' && governorateNames.has(normalizeText(item[1]))))
      : source;
    filtered.sort((a, b) => {
      const selected = Number(b[0] === this.selectedId) - Number(a[0] === this.selectedId);
      if (selected) return selected;
      return (b[6] - a[6]) || (a[5] - b[5]) || String(a[0]).localeCompare(String(b[0]));
    });
    return filtered;
  }

  rectInsideBoundary(rect) {
    const inset = 1;
    const samples = [
      [rect.x + inset, rect.y + inset],
      [rect.x + rect.w - inset, rect.y + inset],
      [rect.x + inset, rect.y + rect.h - inset],
      [rect.x + rect.w - inset, rect.y + rect.h - inset],
      [rect.x + rect.w / 2, rect.y + rect.h / 2]
    ];
    return samples.every(([x, y]) => {
      const lngLat = this.map.unproject([x, y]);
      return pointInBoundary(lngLat.lng, lngLat.lat);
    });
  }

  draw() {
    if (!this.map || !this.map.isStyleLoaded()) return;
    const { width, height } = this.resizeCanvas();
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const zoom = this.map.getZoom();
    const band = Math.floor(zoom * 2) / 2;
    const maxLabels = width < 500
      ? (band >= 15 ? 320 : band >= 12 ? 230 : band >= 9 ? 170 : 90)
      : (band >= 15 ? 850 : band >= 12 ? 620 : band >= 9 ? 430 : 180);
    const topSafe = 92;
    const bottomSafe = 116;
    const sideSafe = 5;
    const cellSize = band < 8 ? 28 : band < 11 ? 22 : band < 14 ? 18 : 15;
    const occupied = new Set();
    const hitRects = [];
    const drawnNameCells = new Set();
    let drawn = 0;

    for (const item of this.candidates(zoom)) {
      if (drawn >= maxLabels) break;
      if (!pointInBoundary(item[2], item[3])) continue;
      const point = this.map.project([item[2], item[3]]);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (point.x < sideSafe || point.x > width - sideSafe || point.y < topSafe || point.y > height - bottomSafe) continue;

      const style = this.styleFor(item, zoom);
      ctx.font = `${style.weight} ${style.size}px "Qalla Hewal", "Noto Sans Arabic", Tahoma, Arial, sans-serif`;
      const metrics = ctx.measureText(item[1]);
      const textWidth = Math.ceil(Math.min(250, Math.max(22, metrics.width)));
      const textHeight = Math.ceil(style.size * 1.45);
      const rect = {
        x: point.x - textWidth / 2 - 3,
        y: point.y - textHeight / 2 - 2,
        w: textWidth + 6,
        h: textHeight + 4
      };
      if (rect.x < sideSafe || rect.x + rect.w > width - sideSafe || rect.y < topSafe || rect.y + rect.h > height - bottomSafe) continue;
      if (!this.rectInsideBoundary(rect)) continue;

      const selected = item[0] === this.selectedId;
      const normalizedName = normalizeText(item[1]);
      const nameCell = `${normalizedName}:${Math.floor(point.x / 90)}:${Math.floor(point.y / 90)}`;
      if (!selected && drawnNameCells.has(nameCell)) continue;

      const left = Math.floor(rect.x / cellSize);
      const right = Math.floor((rect.x + rect.w) / cellSize);
      const top = Math.floor(rect.y / cellSize);
      const bottom = Math.floor((rect.y + rect.h) / cellSize);
      let collision = false;
      for (let gx = left; gx <= right && !collision; gx++) {
        for (let gy = top; gy <= bottom; gy++) {
          if (occupied.has(`${gx}:${gy}`)) { collision = true; break; }
        }
      }
      const major = ['region', 'governorate'].includes(item[4]);
      if (collision && !major && !selected) continue;

      ctx.strokeStyle = 'rgba(0,0,0,0.96)';
      ctx.lineWidth = style.halo;
      ctx.strokeText(item[1], point.x, point.y, 250);
      ctx.fillStyle = style.fill;
      ctx.fillText(item[1], point.x, point.y, 250);
      if (selected) {
        ctx.strokeStyle = '#ffe39a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(point.x - textWidth / 2, point.y + style.size * 0.72);
        ctx.lineTo(point.x + textWidth / 2, point.y + style.size * 0.72);
        ctx.stroke();
      }

      for (let gx = left; gx <= right; gx++) {
        for (let gy = top; gy <= bottom; gy++) occupied.add(`${gx}:${gy}`);
      }
      drawnNameCells.add(nameCell);
      hitRects.push({ ...rect, item });
      drawn++;
    }
    this.hitRects = hitRects;
  }

  hitTest(x, y) {
    for (let index = this.hitRects.length - 1; index >= 0; index--) {
      const rect = this.hitRects[index];
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return rect.item;
    }
    return null;
  }

  destroy() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.map.off('render', this.drawBound);
    this.map.off('resize', this.drawBound);
    this.map.off('styledata', this.drawBound);
    this.canvas.remove();
  }
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
      const item = allItems.find((candidate) => candidate[0] === button.dataset.navResult);
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
  labelLayer?.setSelected(item[0]);
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
  labelLayer?.setSelected(null);
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

async function createMap() {
  installMapUi();
  const [labelsResponse, boundaryResponse, maskResponse] = await Promise.all([
    fetch(`${DATA_BASE}/labels.compact.json`),
    fetch(`${DATA_BASE}/boundary.geojson`),
    fetch(`${DATA_BASE}/outside-mask.geojson`)
  ]);
  if (!labelsResponse.ok || !boundaryResponse.ok || !maskResponse.ok) throw new Error('NAV data files failed to load');
  const labels = await labelsResponse.json();
  const boundary = await boundaryResponse.json();
  const mask = await maskResponse.json();
  boundaryGeometry = boundary.features?.[0]?.geometry || null;
  allItems = sanitizeItems(labels.items || []);
  rebuildSearchIndex();
  const bbox = labels.bbox;

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

  addRuntimeLayers(boundary, mask);
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 28, duration: 0 });
  labelLayer = new CanvasLabelLayer(map, allItems);
  map.on('zoom', updateGpsAccuracyPaint);
  map.on('click', (event) => {
    const label = labelLayer?.hitTest(event.point.x, event.point.y);
    if (label) {
      selectDestination(label);
      return;
    }
    if (!pointInBoundary(event.lngLat.lng, event.lngLat.lat)) toast('دەرەوەی سنووری کارپێکردنی نەخشە داخراوە');
  });

  const databaseItems = sanitizeItems(await loadPublishedPlaces());
  if (databaseItems.length) {
    const existingIds = new Set(allItems.map((item) => item[0]));
    const uniqueDatabaseItems = databaseItems.filter((item) => !existingIds.has(item[0]));
    allItems.push(...uniqueDatabaseItems);
    labelLayer.append(uniqueDatabaseItems);
    rebuildSearchIndex();
  }
  setStatus(`${allItems.length.toLocaleString('en-US')} ناوی شوێن ئامادەیە`, 3000);
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
  if (map) {
    map.resize();
    labelLayer?.scheduleDraw();
  }
};
window.navKurdMapSearch = (value) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => searchItems(value), 90);
};
window.navKurdToggle3D = () => init().then(toggle3D);
window.navKurdLocate = () => init().then(() => startGps({ center: true }));
window.navKurdZoom = (direction) => init().then(() => map.easeTo({ zoom: map.getZoom() + direction, duration: 280 }));
