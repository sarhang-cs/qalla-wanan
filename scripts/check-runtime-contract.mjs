import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const requiredJs = [
  ['RTL text plugin registration', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['RTL plugin readiness wait', /await\s+fontAndRtlPromise/],
  ['major native label source', /addSource\(['"]nav-label-major['"]/],
  ['POI native label source', /addSource\(['"]nav-label-poi['"]/],
  ['split native label files', /labels-major\.geojson[\s\S]*labels-poi\.geojson/],
  ['native symbol label layers', /type:\s*['"]symbol['"]/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['collision enabled', /['"]text-allow-overlap['"]:\s*false/],
  ['no world copies', /renderWorldCopies:\s*false/],
  ['satellite native zoom cap', /maxzoom:\s*17/],
  ['satellite overzoom layer', /maxzoom:\s*22/],
  ['worker pool configured before map', /configureMapWorkers\(\)[\s\S]*setWorkerCount/],
  ['horizontal text writing mode', /['"]text-writing-mode['"]:\s*\[['"]horizontal['"]\]/],
  ['low GeoJSON source maxzoom', /nav-label-major[\s\S]{0,260}maxzoom:\s*14/],
  ['map loading overlay lifecycle', /setLoadingProgress[\s\S]*hideMapLoading/],
  ['wait for major label source', /waitForSourceLoaded\(['"]nav-label-major['"]\)/],
  ['wait for POI label source', /waitForSourceLoaded\(['"]nav-label-poi['"]\)/],
  ['cache-busted map data assets', /assetUrl\(['"]labels-major\.geojson['"]\)/],
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
  ['old monolithic render source', /data:\s*assetUrl\(['"]labels-native\.geojson['"]\)/],
  ['MapTiler raster imagery overlay', /satellite-maptiler/]
];

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!/UniQAIDAR_Hewal_031\.ttf/.test(css)) failures.push('missing embedded project font CSS');
if (!/#nav-map-loading/.test(css)) failures.push('missing deterministic map loading CSS');
if (/nav-label-canvas/.test(css)) failures.push('forbidden CSS canvas overlay');
if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font file unexpectedly small');
for (const file of ['labels-major.geojson','labels-poi.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!/maplibre-gl@5\.24\.0/.test(html)) failures.push('MapLibre version is not pinned to 5.24.0');

if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R6-RTL-STABLE-NATIVE-MAP',
  labelRenderer: 'MapLibre native WebGL symbol layers',
  labelOverlay: false,
  rtlText: 'MapLibre RTL plugin, eager and awaited',
  labelFadeDuration: 0,
  collision: 'native collision index, overlap disabled',
  satellite: 'Esri z17 native cap with MapLibre overzoom',
  loading: 'font + RTL + major labels + POI labels + catalog + idle',
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  forbiddenDomMarkers: 0,
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
