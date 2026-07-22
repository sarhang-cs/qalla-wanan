import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const requiredJs = [
  ['RTL text plugin registration', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['label sources in initial style', /['"]nav-label-core['"]:\s*\{[\s\S]*labels-core\.geojson[\s\S]*['"]nav-label-view['"]:/],
  ['label layers in initial style', /nativeLabelDefinitions\.map\(\(definition\)\s*=>\s*\(\{/],
  ['progressive shard index', /label-shards-index\.json/],
  ['viewport shard loader', /function\s+refreshViewportLabels\b/],
  ['deferred search catalog', /catalogPromise\s*=\s*loadDeferredCatalog/],
  ['native symbol label layers', /type:\s*['"]symbol['"]/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['embedded web font loader', /function\s+ensureProjectFont\b[\s\S]*new\s+FontFace/],
  ['font renderer recovery', /function\s+verifyNativeLabelVisibility\b[\s\S]*SAFE_LABEL_FONT_STACK/],
  ['exact embedded font family', /UniQAIDAR Hewal 031/],
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
  ['late label addSource race', /map\.addSource\(['"]nav-label-(?:core|view)['"]/],
  ['blocking full catalog before map', /catalogPromise\s*=\s*loadDeferredCatalog\(\);[\s\S]{0,600}new\s+maplibregl\.Map/]
];

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!/font-family:"UniQAIDAR Hewal 031"/.test(css)) failures.push('missing exact embedded font family CSS');
if (!/font-display:swap/.test(css)) failures.push('embedded font is not nonblocking');
if (!/#nav-map-loading/.test(css)) failures.push('missing deterministic map loading CSS');
if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font unexpectedly small');
for (const file of ['labels-core.geojson','label-shards-index.json','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!fs.existsSync('public/data/nav/label-shards')) failures.push('missing progressive label shards directory');
if (!/maplibre-gl@5\.24\.0/.test(html)) failures.push('MapLibre version is not pinned to 5.24.0');

if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R8-NATIVE-LABEL-RECOVERY',
  labelRenderer: 'MapLibre native WebGL symbol layers in initial style',
  labelTransport: 'core initial source + viewport GeoJSON shards',
  font: 'embedded FontFace with runtime-safe fallback',
  labelOverlay: false,
  labelFadeDuration: 0,
  loading: 'nonblocking detail labels and search',
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
