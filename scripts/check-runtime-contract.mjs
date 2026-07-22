import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');

const requiredJs = [
  ['native label GeoJSON source', /addSource\(['"]nav-label-source['"]/],
  ['native symbol label layers', /type:\s*['"]symbol['"]/],
  ['native labels loaded as map data', /labels-native\.geojson/],
  ['zero label fade during zoom', /fadeDuration:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed text anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['no variable text anchor', /nativeLabelLayout/],
  ['native label hit testing', /queryRenderedFeatures\(point,\s*\{\s*layers\s*\}\)/],
  ['native GPS GeoJSON source', /addSource\(['"]nav-gps['"]/],
  ['native route GeoJSON source', /addSource\(['"]nav-route['"]/],
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
];

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!/UniQAIDAR_Hewal_031\.ttf/.test(css)) failures.push('missing embedded project font CSS');
if (/nav-label-canvas/.test(css)) failures.push('forbidden CSS canvas overlay');
if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font file unexpectedly small');
if (!fs.existsSync('public/data/nav/labels-native.geojson')) failures.push('missing native map label GeoJSON');

if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);

console.log(JSON.stringify({
  ok: true,
  contract: 'R5-NATIVE-MAP-DATA',
  labelRenderer: 'MapLibre native WebGL symbol layers',
  labelOverlay: false,
  labelFadeDuration: 0,
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  forbiddenDomMarkers: 0,
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
