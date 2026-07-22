import { loadPublishedPlaces } from './backend.js';

const DATA_BASE = new URL('../data/nav/', import.meta.url).href.replace(/\/$/, '');
const CONFIG = window.__APP_CONFIG__ || {};
const MAPTILER_KEY = String(CONFIG.VITE_MAPTILER_KEY || '').trim();
const ROUTING_BASE = String(CONFIG.VITE_ROUTING_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');

let map = null;
let mapReadyPromise = null;
let labelManager = null;
let boundaryGeometry = null;
let allItems = [];
let searchIndex = [];
let searchTimer = 0;
let selectedDestination = null;
let currentPosition = null;
let gpsWatchId = null;
let gpsMarker = null;
let terrainEnabled = false;
let routeBusy = false;
let routeLastAt = 0;

const q = (s) => document.querySelector(s);
const toast = (msg) => {
  if (typeof window.toast === 'function') window.toast(msg);
  else console.info('[NAV]', msg);
};
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function satelliteSource() {
  if (MAPTILER_KEY) {
    return { type: 'raster', url: `https://api.maptiler.com/tiles/satellite-v4/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`, tileSize: 256 };
  }
  return {
    type: 'raster',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics'
  };
}

function baseStyle() {
  const sources = { satellite: satelliteSource() };
  if (MAPTILER_KEY) {
    sources.terrain = {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      tileSize: 256
    };
  }
  return {
    version: 8,
    sources,
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 24 }]
  };
}

function addRuntimeLayers(boundary, mask) {
  if (!map.getSource('nav-outside')) map.addSource('nav-outside', { type: 'geojson', data: mask });
  if (!map.getSource('nav-boundary')) map.addSource('nav-boundary', { type: 'geojson', data: boundary });
  map.addLayer({
    id: 'nav-outside-dark', type: 'fill', source: 'nav-outside',
    paint: { 'fill-color': '#030712', 'fill-opacity': 0.84 }
  });
  map.addLayer({
    id: 'nav-boundary-line', type: 'line', source: 'nav-boundary',
    paint: { 'line-color': '#f5c66b', 'line-width': ['interpolate',['linear'],['zoom'],5,1.2,10,2.2,15,3.2], 'line-opacity': 0.86 }
  });
  map.addSource('nav-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'nav-route-casing', type: 'line', source: 'nav-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#071426', 'line-width': 8, 'line-opacity': 0.9 }
  });
  map.addLayer({
    id: 'nav-route-line', type: 'line', source: 'nav-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2e7cf6', 'line-width': 5, 'line-opacity': 0.96 }
  });
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInBoundary(lng, lat) {
  if (!boundaryGeometry) return true;
  const p = [lng, lat];
  if (boundaryGeometry.type === 'Polygon') {
    const [outer, ...holes] = boundaryGeometry.coordinates;
    return pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h));
  }
  if (boundaryGeometry.type === 'MultiPolygon') {
    return boundaryGeometry.coordinates.some(([outer, ...holes]) => pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h)));
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

const kindNames = {
  region: 'هەرێم', governorate: 'پارێزگا', city: 'شار', town: 'شارۆچکە', village: 'گوند',
  hamlet: 'گوندۆچکە', suburb: 'گەڕەک', neighbourhood: 'گەڕەک', locality: 'شوێن', natural: 'سروشت',
  road: 'ڕێگا', poi: 'شوێن/دوکان', custom: 'شوێنی تۆمارکراو'
};

class DomLabelManager {
  constructor(mapInstance, items) {
    this.map = mapInstance;
    this.items = items;
    this.index = new Map();
    this.markers = new Map();
    this.selectedId = null;
    this.buildIndex();
    this.onRefresh = this.refresh.bind(this);
    mapInstance.on('moveend', this.onRefresh);
    mapInstance.on('zoomend', this.onRefresh);
    mapInstance.on('resize', this.onRefresh);
    mapInstance.on('idle', this.onRefresh);
    mapInstance.on('styledata', this.onRefresh);
    this.waitingForIdle = false;
  }

  buildIndex() {
    this.index.clear();
    for (const item of this.items) {
      const key = `${Math.floor(item[2] * 4)}:${Math.floor(item[3] * 4)}`;
      if (!this.index.has(key)) this.index.set(key, []);
      this.index.get(key).push(item);
    }
  }

  append(items) {
    if (!items?.length) return;
    this.items.push(...items);
    this.buildIndex();
    this.refresh();
  }

  setSelected(id) {
    this.selectedId = id;
    for (const [key, marker] of this.markers) marker.getElement().classList.toggle('is-selected', key === id);
  }

  candidates(bounds, zoom) {
    const west = bounds.getWest(), east = bounds.getEast(), south = bounds.getSouth(), north = bounds.getNorth();
    const out = [];
    const minX = Math.floor(west * 4), maxX = Math.floor(east * 4);
    const minY = Math.floor(south * 4), maxY = Math.floor(north * 4);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = this.index.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (item[5] <= zoom && item[2] >= west && item[2] <= east && item[3] >= south && item[3] <= north) out.push(item);
        }
      }
    }
    out.sort((a, b) => {
      const selected = Number(b[0] === this.selectedId) - Number(a[0] === this.selectedId);
      if (selected) return selected;
      return (b[6] - a[6]) || (a[5] - b[5]) || a[1].localeCompare(b[1], 'ku');
    });
    return out;
  }

  refresh() {
    if (!this.map) return;
    if (!this.map.isStyleLoaded()) {
      if (!this.waitingForIdle) {
        this.waitingForIdle = true;
        this.map.once('idle', () => {
          this.waitingForIdle = false;
          this.refresh();
        });
      }
      return;
    }
    const zoom = this.map.getZoom();
    const width = this.map.getContainer().clientWidth;
    const maxLabels = width < 500 ? (zoom >= 13 ? 260 : 180) : (zoom >= 13 ? 650 : 420);
    const candidates = this.candidates(this.map.getBounds(), zoom);
    const chosen = [];
    const occupied = new Set();
    const cell = zoom < 8 ? 72 : zoom < 11 ? 58 : zoom < 13 ? 48 : 42;

    for (const item of candidates) {
      if (chosen.length >= maxLabels) break;
      const p = this.map.project([item[2], item[3]]);
      const kind = item[4];
      const weight = ['region','governorate','city'].includes(kind) ? 1.35 : 1;
      const estimatedWidth = Math.min(230, Math.max(34, item[1].length * (kind === 'region' ? 13 : kind === 'city' ? 9.5 : 7.2)));
      const estimatedHeight = kind === 'region' ? 28 : kind === 'governorate' ? 22 : 18;
      const left = Math.floor((p.x - estimatedWidth * weight / 2) / cell);
      const right = Math.floor((p.x + estimatedWidth * weight / 2) / cell);
      const top = Math.floor((p.y - estimatedHeight / 2) / cell);
      const bottom = Math.floor((p.y + estimatedHeight / 2) / cell);
      let collision = false;
      for (let gx = left; gx <= right && !collision; gx++) for (let gy = top; gy <= bottom; gy++) if (occupied.has(`${gx}:${gy}`)) { collision = true; break; }
      if (collision && !['region','governorate'].includes(kind) && item[0] !== this.selectedId) continue;
      chosen.push(item);
      for (let gx = left; gx <= right; gx++) for (let gy = top; gy <= bottom; gy++) occupied.add(`${gx}:${gy}`);
    }

    const wanted = new Set(chosen.map((x) => x[0]));
    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) { marker.remove(); this.markers.delete(id); }
    }
    for (const item of chosen) {
      if (this.markers.has(item[0])) continue;
      const el = document.createElement('span');
      el.className = `nav-map-label nav-map-label--${item[4]}` + (item[0] === this.selectedId ? ' is-selected' : '');
      el.textContent = item[1];
      el.title = [item[1], item[7], item[8]].filter(Boolean).join(' · ');
      el.dataset.id = item[0];
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        selectDestination(item);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([item[2], item[3]]).addTo(this.map);
      this.markers.set(item[0], marker);
    }
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
    q('#nav-route-go').addEventListener('click', routeToSelected);
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
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nav-map-results') && !e.target.closest('#map-search')) hideSearchResults();
  });
}

function setStatus(message, ms = 2300) {
  const el = q('#nav-data-state');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => el.classList.remove('show'), ms);
}

function hideSearchResults() { q('#nav-map-results')?.classList.remove('show'); }

function rebuildSearchIndex() {
  searchIndex = allItems.map((item) => ({ item, name: normalizeText(item[1]), context: normalizeText(`${item[7]} ${item[8]}`) }));
}

function searchItems(query) {
  const needle = normalizeText(query);
  const box = q('#nav-map-results');
  if (!box) return;
  if (needle.length < 2) { box.innerHTML = ''; box.classList.remove('show'); return; }
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
  matches.sort((a,b) => b[0] - a[0]);
  const top = matches.slice(0, 12).map((x) => x[1]);
  if (!top.length) {
    box.innerHTML = '<div class="nav-search-item"><div class="nav-search-copy"><b>هیچ شوێنێک نەدۆزرایەوە</b><small>ناوەکە بە شێوازێکی تر بنووسە</small></div></div>';
  } else {
    box.innerHTML = top.map((item) => `<button class="nav-search-item" data-nav-result="${escapeHtml(item[0])}"><div class="nav-search-copy"><b>${escapeHtml(item[1])}</b><small>${escapeHtml(item[7] || item[8] || kindNames[item[4]] || '')}</small></div><span class="nav-search-kind">${escapeHtml(kindNames[item[4]] || 'شوێن')}</span></button>`).join('');
    box.querySelectorAll('[data-nav-result]').forEach((btn) => btn.addEventListener('click', () => {
      const item = allItems.find((x) => x[0] === btn.dataset.navResult);
      if (item) selectDestination(item);
    }));
  }
  box.classList.add('show');
}

function selectDestination(item) {
  if (!pointInBoundary(item[2], item[3])) { toast('ئەم شوێنە لە دەرەوەی سنووری کارپێکردنی نەخشەیە'); return; }
  selectedDestination = item;
  labelManager?.setSelected(item[0]);
  hideSearchResults();
  q('#map-search').value = item[1];
  q('#nav-route-name').textContent = item[1];
  q('#nav-route-meta').textContent = item[7] || item[8] || 'ئامادەی ڕێنوێنی GPS';
  q('#nav-route-panel').classList.add('show');
  map.flyTo({ center: [item[2], item[3]], zoom: Math.max(13, map.getZoom()), duration: 900, essential: true });
  setTimeout(() => labelManager?.refresh(), 950);
}

function clearDestination() {
  selectedDestination = null;
  labelManager?.setSelected(null);
  q('#nav-route-panel')?.classList.remove('show');
  q('#map-search').value = '';
  const source = map?.getSource('nav-route');
  source?.setData({ type: 'FeatureCollection', features: [] });
}

function startGps({ center = true } = {}) {
  if (!navigator.geolocation) { toast('GPS لەم ئامێرە بەردەست نییە'); return; }
  if (gpsWatchId !== null) {
    if (center && currentPosition) map.flyTo({ center: currentPosition, zoom: Math.max(15, map.getZoom()), duration: 700 });
    return;
  }
  setStatus('GPS خەریکە شوێنت دەدۆزێتەوە…', 4000);
  gpsWatchId = navigator.geolocation.watchPosition((position) => {
    const lng = position.coords.longitude, lat = position.coords.latitude;
    currentPosition = [lng, lat];
    if (!gpsMarker) {
      const el = document.createElement('div');
      el.className = 'nav-gps-dot';
      el.title = 'شوێنی ئێستای تۆ';
      gpsMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(currentPosition).addTo(map);
      if (center) map.flyTo({ center: currentPosition, zoom: 15.5, duration: 900, essential: true });
    } else gpsMarker.setLngLat(currentPosition);
    const accuracy = Math.round(position.coords.accuracy || 0);
    setStatus(`GPS چالاکە · وردی نزیکەیی ${accuracy} م`, 1800);
    if (selectedDestination && Date.now() - routeLastAt > 30000) routeToSelected({ silent: true });
  }, (error) => {
    gpsWatchId = null;
    const msg = error.code === 1 ? 'ڕێگەپێدانی GPS پێویستە' : 'شوێنی GPS بەدەست نەهات';
    toast(msg);
  }, { enableHighAccuracy: true, maximumAge: 2500, timeout: 15000 });
}

async function routeToSelected(options = {}) {
  if (routeBusy || !selectedDestination) return;
  if (!currentPosition) { startGps({ center: true }); toast('دوای دیاریکردنی شوێنت، دووبارە GPS دابگرە'); return; }
  if (!pointInBoundary(currentPosition[0], currentPosition[1])) { toast('شوێنی ئێستات لە دەرەوەی سنووری نەخشەیە'); return; }
  routeBusy = true;
  q('#nav-route-go').disabled = true;
  q('#nav-route-meta').textContent = 'خەریکە ڕێگا دەدۆزرێتەوە…';
  try {
    const [lng, lat] = currentPosition;
    const dest = selectedDestination;
    const url = `${ROUTING_BASE}/route/v1/driving/${lng},${lat};${dest[2]},${dest[3]}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`route HTTP ${response.status}`);
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route?.geometry) throw new Error('no route');
    map.getSource('nav-route').setData({ type: 'Feature', properties: {}, geometry: route.geometry });
    const km = route.distance / 1000;
    const min = Math.round(route.duration / 60);
    q('#nav-route-meta').textContent = `${km.toFixed(km < 10 ? 1 : 0)} کم · نزیکەی ${min} خولەک`;
    routeLastAt = Date.now();
    const coords = route.geometry.coordinates;
    const b = coords.reduce((bounds, coord) => bounds.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(b, { padding: { top: 150, bottom: 145, left: 55, right: 55 }, duration: 900 });
  } catch (error) {
    console.warn('[NAV route]', error);
    q('#nav-route-meta').textContent = 'ڕێگا بەدەست نەهات';
    if (!options.silent) toast('خزمەتی ڕێنوێنی لەم کاتەدا بەردەست نییە');
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
    fetch(`${DATA_BASE}/labels.compact.json`), fetch(`${DATA_BASE}/boundary.geojson`), fetch(`${DATA_BASE}/outside-mask.geojson`)
  ]);
  if (!labelsResponse.ok || !boundaryResponse.ok || !maskResponse.ok) throw new Error('NAV data files failed to load');
  const labels = await labelsResponse.json();
  const boundary = await boundaryResponse.json();
  const mask = await maskResponse.json();
  allItems = labels.items || [];
  rebuildSearchIndex();
  boundaryGeometry = boundary.features?.[0]?.geometry || null;
  const bbox = labels.bbox;

  map = new maplibregl.Map({
    container: 'leafmap', style: baseStyle(), center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], zoom: 6.2,
    minZoom: 5.1, maxZoom: 19, pitchWithRotate: true, dragRotate: true, touchPitch: true,
    attributionControl: true, antialias: true, maxBounds: [[bbox[0]-1.25,bbox[1]-1.0],[bbox[2]+1.25,bbox[3]+1.0]]
  });

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('map load timeout')), 25000);
    map.once('load', () => { window.clearTimeout(timer); resolve(); });
    map.on('error', (event) => console.warn('[NAV map resource]', event.error || event));
  });
  addRuntimeLayers(boundary, mask);
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 28, duration: 0 });
  labelManager = new DomLabelManager(map, allItems);
  labelManager.refresh();
  map.once('idle', () => labelManager?.refresh());
  map.on('click', (event) => {
    if (!pointInBoundary(event.lngLat.lng, event.lngLat.lat)) toast('دەرەوەی سنووری کارپێکردنی نەخشە داخراوە');
  });

  const dbItems = await loadPublishedPlaces();
  const accepted = dbItems.filter((x) => pointInBoundary(x[2], x[3]));
  if (accepted.length) {
    labelManager.append(accepted);
    rebuildSearchIndex();
  }
  setStatus(`${labels.count.toLocaleString('en-US')} ناوی شوێن ئامادەیە`, 3000);
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
window.navKurdMapResize = () => { if (map) { map.resize(); labelManager?.refresh(); } };
window.navKurdMapSearch = (value) => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => searchItems(value), 90);
};
window.navKurdToggle3D = () => init().then(toggle3D);
window.navKurdLocate = () => init().then(() => startGps({ center: true }));
window.navKurdZoom = (direction) => init().then(() => map.easeTo({ zoom: map.getZoom() + direction, duration: 280 }));
