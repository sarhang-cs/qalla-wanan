import fs from 'node:fs';

const jsPath = 'src/nav-map.js';
const cssPath = 'src/nav-map.css';
const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const requiredJs = [
  ['canvas label engine', /class\s+CanvasLabelLayer\b/],
  ['stable source-coordinate projection', /this\.map\.project\(\[item\[2\],\s*item\[3\]\]\)/],
  ['screen rectangle clipped against canonical boundary', /rectInsideBoundary\(rect\)/],
  ['boundary sampling through unproject', /this\.map\.unproject\(\[x,\s*y\]\)/],
  ['native GPS GeoJSON source', /addSource\(['"]nav-gps['"]/],
  ['native route GeoJSON source', /addSource\(['"]nav-route['"]/],
  ['GPS jump rejection', /distance\s*>\s*plausibleDistance/],
  ['stationary GPS jitter suppression', /distance\s*<=\s*stationaryThreshold/],
  ['route geometry validation', /function\s+validateRouteGeometry\b/],
  ['route request cancellation', /new\s+AbortController\(\)/],
  ['full boundary restriction for click interaction', /pointInBoundary\(event\.lngLat\.lng,\s*event\.lngLat\.lat\)/]
];

const forbiddenJs = [
  ['DOM MapLibre marker usage', /new\s+maplibregl\.Marker\s*\(/],
  ['legacy movable label element', /nav-map-label/],
];

const requiredCss = [
  ['canvas overlay style', /\.nav-label-canvas\s*\{/],
  ['canvas does not intercept map gestures', /\.nav-label-canvas[^}]*pointer-events\s*:\s*none/s],
  ['embedded project font', /UniQAIDAR_Hewal_031\.ttf/]
];

const drawMatch = js.match(/\n  draw\(\) \{([\s\S]*?)\n  \}\n\n  hitTest/);
const drawBody = drawMatch?.[1] || '';

const failures = [];
for (const [name, pattern] of requiredJs) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbiddenJs) if (pattern.test(js)) failures.push(`forbidden: ${name}`);
if (!drawMatch) failures.push('missing CanvasLabelLayer.draw body');
if (/item\[2\]\s*=|item\[3\]\s*=/.test(drawBody)) failures.push('forbidden: coordinate mutation during label rendering');
for (const [name, pattern] of requiredCss) if (!pattern.test(css)) failures.push(`missing CSS: ${name}`);

if (!fs.existsSync('public/fonts/UniQAIDAR_Hewal_031.ttf')) failures.push('missing embedded font file');
if (fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size < 10_000) failures.push('embedded font file is unexpectedly small');

if (failures.length) {
  throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);
}

console.log(JSON.stringify({
  ok: true,
  contract: 'R4-GEO-STABILITY',
  labelRenderer: 'canvas/native projection',
  gpsRenderer: 'MapLibre GeoJSON layers',
  routeRenderer: 'MapLibre GeoJSON line layers',
  forbiddenDomMarkers: 0,
  coordinateMutation: 0,
  fontBytes: fs.statSync('public/fonts/UniQAIDAR_Hewal_031.ttf').size
}, null, 2));
