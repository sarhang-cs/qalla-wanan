import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('DATA_MANIFEST.json', 'utf8'));
const renderBuilder = fs.readFileSync('scripts/build-render-data.mjs', 'utf8');

const required = [
  ['R13 release', /2026-07-23-qalla-wanan-r13-nav-readable-labels/],
  ['RTL plugin', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['Vazirmatn app label font', /const LABEL_FONT_UI = 'Vazirmatn'/],
  ['Noto Kufi major label font', /const LABEL_FONT_HEADING = 'Noto Kufi Arabic'/],
  ['web font preload before map', /document\.fonts\.load\(`700 24px/],
  ['three immutable label sources', /labels-major\.geojson[\s\S]*labels-poi\.geojson[\s\S]*labels-detail\.geojson/],
  ['native symbol labels', /nativeLabelDefinitions\.map\([\s\S]*type:\s*['"]symbol['"]/],
  ['compact capsule IDs', /nav-capsule-major[\s\S]*nav-capsule-place[\s\S]*nav-capsule-poi/],
  ['nine slice capsule', /map\.addImage\(id,\s*image,\s*\{[\s\S]*stretchX:[\s\S]*stretchY:[\s\S]*content:/],
  ['capsule fitted to text', /['"]icon-text-fit['"]:\s*['"]both['"]/],
  ['compact capsule geometry', /const width = 52;[\s\S]*const height = 22;/],
  ['decluttered local POIs', /tier: 'poi_local'.*minzoom: 16\.1/],
  ['decluttered detail POIs', /tier: 'poi_detail'.*minzoom: 17\.6/],
  ['white map text', /['"]text-color['"]:\s*['"]#f8fbff['"]/],
  ['no black text border', /['"]text-halo-width['"]:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed center anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['horizontal RTL writing', /['"]text-writing-mode['"]:\s*\[['"]horizontal['"]\]/],
  ['collision spacing', /['"]text-padding['"]:\s*definition\.collisionPadding/],
  ['zero fade', /fadeDuration:\s*0/],
  ['MapTiler satellite', /satellite-v4\/tiles\.json/],
  ['Esri satellite fallback', /World_Imagery\/MapServer\/tile/],
  ['native GPS', /['"]nav-gps['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['native route', /['"]nav-route['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['GPS jump rejection', /distance\s*>\s*plausibleDistance/],
  ['boundary click restriction', /pointInBoundary\(event\.lngLat\.lng,\s*event\.lngLat\.lat\)/]
];
const forbidden = [
  ['DOM map markers', /new\s+maplibregl\.Marker\s*\(/],
  ['canvas label overlay', /CanvasLabelLayer|nav-label-canvas|measureText\(/],
  ['variable anchor movement', /text-variable-anchor/],
  ['viewport source mutation', /refreshViewportLabels|scheduleViewportLabels|map\.getSource\(['"]nav-label-(?:major|poi|detail)['"]\)\.setData/],
  ['terrain or 3D mode', /sources\.terrain|setTerrain\(|toggle3D|navKurdToggle3D|btn-layers/],
  ['legacy redistributed font', /UniQAIDAR_Hewal_031\.ttf/]
];
const failures=[];
for (const [name, pattern] of required) if (!pattern.test(js)) failures.push(`missing: ${name}`);
if (!/slim\.display_name\s*=\s*normalizeDisplayName/.test(renderBuilder)) failures.push('missing: normalized RTL display name');
for (const [name, pattern] of forbidden) if (pattern.test(js) || pattern.test(html)) failures.push(`forbidden: ${name}`);
if (!/Vazirmatn/.test(css) || !/Noto Kufi Arabic/.test(html)) failures.push('app web-font stack missing');
if (!/#nav-map-loading/.test(css)) failures.push('map loader missing');
for (const file of ['labels-major.geojson','labels-poi.geojson','labels-detail.geojson','labels-native.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (manifest.release !== '2026-07-23-qalla-wanan-r13-nav-readable-labels') failures.push('manifest release mismatch');
if (manifest.source_records !== 69000 || manifest.render_records !== 69000) failures.push('69,000 record contract failed');
if (manifest.coordinate_mutation !== 0 || manifest.outside_canonical_boundary !== 0) failures.push('coordinate/boundary contract failed');
if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);
console.log(JSON.stringify({
  ok:true,
  contract:'R13-NAV-READABLE-LABELS-SATELLITE-GPS-69000',
  renderer:'MapLibre native WebGL symbol layers',
  labelBackground:'compact dark translucent nine-slice capsule',
  labelFonts:['Noto Kufi Arabic','Vazirmatn'],
  progressiveDensity:true,
  fixedCoordinates:true,
  satelliteOnly:true,
  gps:true,
  route:true,
  sourceRecords:manifest.source_records,
  renderRecords:manifest.render_records,
  coordinateMutation:manifest.coordinate_mutation,
  outsideCanonicalBoundary:manifest.outside_canonical_boundary
}, null, 2));
