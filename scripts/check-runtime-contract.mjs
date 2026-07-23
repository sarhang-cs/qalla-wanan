import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('DATA_MANIFEST.json', 'utf8'));
const renderBuilder = fs.readFileSync('scripts/build-render-data.mjs', 'utf8');
const installer = fs.readFileSync('TERMUX_INSTALL_R15_AND_PUSH.sh', 'utf8');

const required = [
  ['R15 release', /2026-07-23-qalla-wanan-r15-large-readable-rtl/],
  ['RTL plugin', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['map font constant', /const MAP_LABEL_FONT = 'UniQAIDAR_Money Heist 002'/],
  ['single map font stack', /const MAP_LABEL_FONT_STACK = \[MAP_LABEL_FONT/],
  ['font preload before map', /document\.fonts\.load\(`\$\{index === 0 \? 22 : 17\}px/],
  ['font-face CSS', /@font-face\{font-family:"UniQAIDAR_Money Heist 002"/],
  ['font binary URL', /UniQAIDAR-Money-Heist-002\.ttf/],
  ['app font retained', /--app-font:"Vazirmatn"/],
  ['three immutable label sources', /labels-major\.geojson[\s\S]*labels-poi\.geojson[\s\S]*labels-detail\.geojson/],
  ['native symbol labels', /nativeLabelDefinitions\.map\([\s\S]*type:\s*['"]symbol['"]/],
  ['compact capsule IDs', /nav-capsule-major[\s\S]*nav-capsule-place[\s\S]*nav-capsule-poi/],
  ['nine slice capsule', /map\.addImage\(id,\s*image,\s*\{[\s\S]*stretchX:[\s\S]*stretchY:[\s\S]*content:/],
  ['capsule fitted to text', /['"]icon-text-fit['"]:\s*['"]both['"]/],
  ['compact capsule geometry', /const width = 44;[\s\S]*const height = 20;/],
  ['balanced detail POIs', /tier: 'poi_detail'.*minzoom: 18\.5/],
  ['white map text', /['"]text-color['"]:\s*['"]#f8fbff['"]/],
  ['no black text border', /['"]text-halo-width['"]:\s*0/],
  ['fixed point placement', /['"]symbol-placement['"]:\s*['"]point['"]/],
  ['fixed center anchor', /['"]text-anchor['"]:\s*['"]center['"]/],
  ['horizontal RTL writing', /['"]text-writing-mode['"]:\s*\[['"]horizontal['"]\]/],
  ['zero fade', /fadeDuration:\s*0/],
  ['MapTiler satellite', /satellite-v4\/tiles\.json/],
  ['Esri satellite fallback', /World_Imagery\/MapServer\/tile/],
  ['native GPS', /['"]nav-gps['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['native route', /['"]nav-route['"]:\s*\{\s*type:\s*['"]geojson['"]/],
  ['font copied from Downloads', /storage\/downloads[\s\S]*UniQAIDAR-Money-Heist-002\.ttf/]
];
const forbidden = [
  ['DOM map markers', /new\s+maplibregl\.Marker\s*\(/],
  ['canvas label overlay', /CanvasLabelLayer|nav-label-canvas|measureText\(/],
  ['variable anchor movement', /text-variable-anchor/],
  ['viewport source mutation', /refreshViewportLabels|scheduleViewportLabels|map\.getSource\(['"]nav-label-(?:major|poi|detail)['"]\)\.setData/],
  ['terrain or 3D mode', /sources\.terrain|setTerrain\(|toggle3D|navKurdToggle3D|btn-layers/],
  ['map font applied to app UI', /--app-font:"UniQAIDAR_Money Heist 002"/]
];
const failures=[];
for (const [name, pattern] of required) {
  const haystack = name === 'font-face CSS' || name === 'font binary URL' || name === 'app font retained' ? `${css}\n${html}` : name === 'font copied from Downloads' ? installer : js;
  if (!pattern.test(haystack)) failures.push(`missing: ${name}`);
}
if (!/slim\.display_name\s*=\s*normalizeDisplayName/.test(renderBuilder)) failures.push('missing: normalized RTL display name');
for (const [name, pattern] of forbidden) if (pattern.test(js) || pattern.test(css) || pattern.test(html)) failures.push(`forbidden: ${name}`);
for (const file of ['labels-major.geojson','labels-poi.geojson','labels-detail.geojson','labels-native.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (!fs.existsSync('public/fonts/UniQAIDAR-Money-Heist-002.ttf')) failures.push('map font was not installed into public/fonts');
if (manifest.release !== '2026-07-23-qalla-wanan-r15-large-readable-rtl') failures.push('manifest release mismatch');
if (manifest.source_records !== 69000 || manifest.render_records !== 69000) failures.push('69,000 record contract failed');
if (manifest.coordinate_mutation !== 0 || manifest.outside_canonical_boundary !== 0) failures.push('coordinate/boundary contract failed');
if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);
console.log(JSON.stringify({
  ok:true,
  contract:'R15-LARGE-READABLE-RTL-SATELLITE-GPS-69000',
  renderer:'MapLibre native WebGL symbol layers',
  mapLabelFont:'UniQAIDAR_Money Heist 002',
  appFonts:['Vazirmatn','Noto Kufi Arabic'],
  labelBackground:'compact dark translucent nine-slice capsule',
  rtl:'NFC normalized display names plus MapLibre RTL plugin',
  fixedCoordinates:true,
  satelliteOnly:true,
  gps:true,
  route:true,
  sourceRecords:manifest.source_records,
  renderRecords:manifest.render_records,
  coordinateMutation:manifest.coordinate_mutation,
  outsideCanonicalBoundary:manifest.outside_canonical_boundary
}, null, 2));
