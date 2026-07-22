import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('DATA_MANIFEST.json', 'utf8'));

const requiredJs = [
  ['R10 release', /2026-07-22-qalla-wanan-r10-glass-69000/],
  ['RTL text plugin registration', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['major labels in initial style', /['"]nav-label-major['"]:\s*\{[\s\S]*labels-major\.geojson/],
  ['POI labels in initial style', /['"]nav-label-poi['"]:\s*\{[\s\S]*labels-poi\.geojson/],
  ['detail labels in initial style', /['"]nav-label-detail['"]:\s*\{[\s\S]*labels-detail\.geojson/],
  ['native symbol label layers', /nativeLabelDefinitions\.map\(\(definition\)\s*=>\s*\(\{[\s\S]*type:\s*['"]symbol['"]/],
  ['native glass label image IDs', /nav-glass-warm[\s\S]*nav-glass-major[\s\S]*nav-glass-poi/],
  ['nine-slice glass image generation', /map\.addImage\(id,\s*image,\s*\{[\s\S]*stretchX:[\s\S]*stretchY:[\s\S]*content:/],
  ['glass style image recovery', /styleimagemissing[\s\S]*ensureGlassLabelImage/],
  ['glass fitted to text', /['"]icon-text-fit['"]:\s*['"]both['"]/],
  ['glass padding', /['"]icon-text-fit-padding['"]:/],
  ['glass and text coupled', /['"]icon-optional['"]:\s*false/],
  ['no black text halo', /['"]text-halo-width['"]:\s*0/],
  ['larger region font', /tier:\s*['"]region['"][\s\S]{0,220}\b27\b[\s\S]{0,100}\b35\b/],
  ['larger city font', /tier:\s*['"]city['"][\s\S]{0,240}\b18\.5\b[\s\S]{0,120}\b26\b/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['stable source ordering', /['"]symbol-z-order['"]:\s*['"]source['"]/],
  ['embedded web font loader', /function\s+ensureProjectFont\b[\s\S]*new\s+FontFace/],
  ['font renderer recovery', /function\s+verifyNativeLabelVisibility\b[\s\S]*SAFE_LABEL_FONT_STACK/],
  ['exact embedded font family', /UniQAIDAR Hewal 031/],
  ['all three label sources ready', /waitForSourceLoaded\(['"]nav-label-major['"][\s\S]*waitForSourceLoaded\(['"]nav-label-poi['"][\s\S]*waitForSourceLoaded\(['"]nav-label-detail['"]/],
  ['69,000 loading contract', /69,000/],
  ['deferred search catalog', /catalogPromise\s*=\s*loadDeferredCatalog/],
  ['no world copies', /renderWorldCopies:\s*false/],
  ['Esri native zoom cap', /maxzoom:\s*16/],
  ['MapTiler satellite', /satellite-v4\/tiles\.json/],
  ['worker pool configured', /configureMapWorkers\(\)/],
  ['loader failure escape', /function\s+failMapLoading\b[\s\S]*hideMapLoading/],
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
  ['viewport source mutation', /refreshViewportLabels|scheduleViewportLabels|nav-label-view|label-shards-index|map\.getSource\(['"]nav-label-(?:major|poi|detail)['"]\)\.setData/],
  ['late label addSource race', /map\.addSource\(['"]nav-label-(?:major|poi|detail)['"]/],
  ['black text halo', /['"]text-halo-color['"]:\s*['"](?:#0{3,6}|black|rgba?\(0\s*,\s*0\s*,\s*0\s*,\s*(?!0\b)[^)]+\))/i],
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
for (const file of ['labels-major.geojson','labels-poi.geojson','labels-detail.geojson','labels-native.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!/maplibre-gl@5\.24\.0/.test(html)) failures.push('MapLibre version is not pinned to 5.24.0');
if (manifest.release !== '2026-07-22-qalla-wanan-r10-glass-69000') failures.push('manifest release mismatch');
if (manifest.source_records !== 69000 || manifest.render_records !== 69000) failures.push('manifest must contain exactly 69,000 source and render records');
if (manifest.coordinate_mutation !== 0 || manifest.outside_canonical_boundary !== 0) failures.push('manifest coordinate/boundary contract failed');
if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R10-GLASS-69000',
  labelRenderer: 'MapLibre native WebGL symbol layers',
  labelBackground: 'native nine-slice glass image via icon-text-fit',
  blackTextBorder: false,
  sourceRecords: manifest.source_records,
  renderRecords: manifest.render_records,
  labelTransport: 'three immutable full GeoJSON sources loaded in the initial style',
  viewportSourceMutation: false,
  labelOverlay: false,
  labelFadeDuration: 0,
  loading: 'waits for major, POI and detail sources; search remains deferred',
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  coordinateMutation: manifest.coordinate_mutation,
  outsideCanonicalBoundary: manifest.outside_canonical_boundary,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
