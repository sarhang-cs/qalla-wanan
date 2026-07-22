import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const requiredJs = [
  ['RTL text plugin registration', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['major labels in initial style', /['"]nav-label-major['"]:\s*\{[\s\S]*labels-major\.geojson/],
  ['POI labels in initial style', /['"]nav-label-poi['"]:\s*\{[\s\S]*labels-poi\.geojson/],
  ['label layers in initial style', /nativeLabelDefinitions\.map\(\(definition\)\s*=>\s*\(\{/],
  ['native symbol label layers', /type:\s*['"]symbol['"]/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['stable source ordering', /['"]symbol-z-order['"]:\s*['"]source['"]/],
  ['embedded web font loader', /function\s+ensureProjectFont\b[\s\S]*new\s+FontFace/],
  ['font renderer recovery', /function\s+verifyNativeLabelVisibility\b[\s\S]*SAFE_LABEL_FONT_STACK/],
  ['exact embedded font family', /UniQAIDAR Hewal 031/],
  ['full label source readiness', /waitForSourceLoaded\(['"]nav-label-major['"][\s\S]*waitForSourceLoaded\(['"]nav-label-poi['"]/],
  ['deferred search catalog', /catalogPromise\s*=\s*loadDeferredCatalog/],
  ['no world copies', /renderWorldCopies:\s*false/],
  ['Esri native zoom cap', /maxzoom:\s*16/],
  ['MapTiler satellite', /satellite-v4\/tiles\.json/],
  ['worker pool configured', /configureMapWorkers\(\)/],
  ['map loading lifecycle', /setLoadingProgress[\s\S]*hideMapLoading/],
  ['loader failure escape', /function\s+failMapLoading\b/],
  ['native label hit testing', /queryRenderedFeatures\(point,\s*\{\s*layers\s*\}\)/],
  ['native GPS source', /['"]nav-gps['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['native route source', /['"]nav-route['"]:\s*\{\s*type:\s*['"]geojson['"]/],
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
  ['viewport shard mutation', /refreshViewportLabels|scheduleViewportLabels|nav-label-view|label-shards-index/],
  ['late label addSource race', /map\.addSource\(['"]nav-label-(?:major|poi)['"]/],
  ['blocking search catalog before map', /catalogPromise\s*=\s*loadDeferredCatalog\(\);[\s\S]{0,600}new\s+maplibregl\.Map/]
];

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!/font-family:"UniQAIDAR Hewal 031"/.test(css)) failures.push('missing exact embedded font family CSS');
if (!/font-display:swap/.test(css)) failures.push('embedded font is not nonblocking');
if (!/#nav-map-loading/.test(css)) failures.push('missing deterministic map loading CSS');
if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font unexpectedly small');
for (const file of ['labels-major.geojson','labels-poi.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!/maplibre-gl@5\.24\.0/.test(html)) failures.push('MapLibre version is not pinned to 5.24.0');
if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R9-FULL-NATIVE-LABELS',
  labelRenderer: 'MapLibre native WebGL symbol layers',
  labelTransport: 'two immutable full GeoJSON sources loaded in the initial style',
  viewportSourceMutation: false,
  labelOverlay: false,
  labelFadeDuration: 0,
  loading: 'waits for major and POI sources; search remains deferred',
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
