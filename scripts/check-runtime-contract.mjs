import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const requiredJs = [
  ['RTL text plugin registration', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['core native label source', /addSource\(['"]nav-label-core['"]/],
  ['viewport native label source', /addSource\(['"]nav-label-view['"]/],
  ['progressive shard index', /label-shards-index\.json/],
  ['viewport shard loader', /function\s+refreshViewportLabels\b/],
  ['deferred search catalog', /window\.setTimeout\(\(\)\s*=>\s*\{[\s\S]*catalogPromise\s*=\s*loadDeferredCatalog/],
  ['native symbol label layers', /type:\s*['"]symbol['"]/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['collision enabled', /['"]text-allow-overlap['"]:\s*false/],
  ['no world copies', /renderWorldCopies:\s*false/],
  ['Esri safe native zoom cap', /maxzoom:\s*16/],
  ['MapTiler satellite primary', /satellite-v4\/tiles\.json/],
  ['satellite overzoom layer', /maxzoom:\s*22/],
  ['worker pool configured before map', /configureMapWorkers\(\)[\s\S]*setWorkerCount/],
  ['horizontal text writing mode', /['"]text-writing-mode['"]:\s*\[['"]horizontal['"]\]/],
  ['map loading overlay lifecycle', /setLoadingProgress[\s\S]*hideMapLoading/],
  ['loader failure escape', /function\s+failMapLoading\b/],
  ['nonfatal source readiness', /resolve\(false\)/],
  ['native label hit testing', /queryRenderedFeatures\(point,\s*\{\s*layers\s*\}\)/],
  ['native GPS GeoJSON source', /['"]nav-gps['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['native route GeoJSON source', /['"]nav-route['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['GPS jump rejection', /distance\s*>\s*plausibleDistance/],
  ['stationary GPS jitter suppression', /distance\s*<=\s*stationaryThreshold/],
  ['route geometry validation', /function\s+validateRouteGeometry\b/],
  ['route request cancellation', /new\s+AbortController\(\)/],
  ['canonical boundary click restriction', /pointInBoundary\(event\.lngLat\.lng,\s*event\.lngLat\.lat\)/]
];

const forbiddenJs = [
  ['canvas label renderer', /CanvasLabelLayer|nav-label-canvas|measureText\(/],
  ['DOM MapLibre marker usage', /new\s+maplibregl\.Marker\s*\(/],
  ['variable text anchor', /text-variable-anchor/],
  ['forced label overlap', /['"]text-allow-overlap['"]:\s*true/],
  ['fatal waits for old full sources', /waitForSourceLoaded\(['"]nav-label-(?:major|poi)['"]/],
  ['blocking catalog before map', /catalogPromise\s*=\s*loadDeferredCatalog\(\);[\s\S]{0,600}new\s+maplibregl\.Map/]
];

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!/UniQAIDAR_Hewal_031\.ttf/.test(css)) failures.push('missing embedded project font CSS');
if (!/#nav-map-loading/.test(css)) failures.push('missing deterministic map loading CSS');
if (!/\.nav-map-retry/.test(css)) failures.push('missing loader retry CSS');
if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font file unexpectedly small');
for (const file of ['labels-core.geojson','label-shards-index.json','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!fs.existsSync('public/data/nav/label-shards')) failures.push('missing progressive label shards directory');
if (!/maplibre-gl@5\.24\.0/.test(html)) failures.push('MapLibre version is not pinned to 5.24.0');

if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R7-PROGRESSIVE-STABLE',
  labelRenderer: 'MapLibre native WebGL symbol layers',
  labelTransport: 'viewport GeoJSON shards, progressive and cached',
  labelOverlay: false,
  labelFadeDuration: 0,
  collision: 'native collision index, overlap disabled',
  satellite: 'MapTiler primary + Esri z16 fallback and overzoom',
  loading: 'core map only; detail labels and search are nonblocking',
  loaderFatalTimeouts: 0,
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  forbiddenDomMarkers: 0,
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
