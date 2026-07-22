import fs from 'node:fs';

const js = fs.readFileSync('src/nav-map.js', 'utf8');
const css = fs.readFileSync('src/nav-map.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('DATA_MANIFEST.json', 'utf8'));

const required = [
  ['R11 release', /2026-07-22-qalla-wanan-r11-nav-capsule-satellite-gps/],
  ['RTL plugin', /setRTLTextPlugin\(RTL_PLUGIN_URL,\s*false\)/],
  ['three immutable label sources', /labels-major\.geojson[\s\S]*labels-poi\.geojson[\s\S]*labels-detail\.geojson/],
  ['native symbol labels', /nativeLabelDefinitions\.map\([\s\S]*type:\s*['"]symbol['"]/],
  ['compact capsule IDs', /nav-capsule-major[\s\S]*nav-capsule-place[\s\S]*nav-capsule-poi/],
  ['nine slice capsule', /map\.addImage\(id,\s*image,\s*\{[\s\S]*stretchX:[\s\S]*stretchY:[\s\S]*content:/],
  ['capsule fitted to text', /['"]icon-text-fit['"]:\s*['"]both['"]/],
  ['small capsule padding', /boxPadding:\s*\[2(?:\.5)?,\s*(?:5|5\.5|6|6\.5),/],  ['larger readable POI type', /tier: 'poi_local'.*14\.7/],
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
  ['GPS jump rejection', /distance\s*>\s*plausibleDistance/],
  ['boundary click restriction', /pointInBoundary\(event\.lngLat\.lng,\s*event\.lngLat\.lat\)/]
];
const forbidden = [
  ['DOM map markers', /new\s+maplibregl\.Marker\s*\(/],
  ['canvas label overlay', /CanvasLabelLayer|nav-label-canvas|measureText\(/],
  ['variable anchor movement', /text-variable-anchor/],
  ['viewport source mutation', /refreshViewportLabels|scheduleViewportLabels|map\.getSource\(['"]nav-label-(?:major|poi|detail)['"]\)\.setData/],
  ['terrain or 3D mode', /sources\.terrain|setTerrain\(|toggle3D|navKurdToggle3D|btn-layers/],
];
const failures=[];
for (const [name, pattern] of required) if (!pattern.test(js)) failures.push(`missing: ${name}`);
for (const [name, pattern] of forbidden) if (pattern.test(js) || pattern.test(html)) failures.push(`forbidden: ${name}`);
if (!/font-family:"UniQAIDAR Hewal 031"/.test(css)) failures.push('project font CSS missing');
if (!/#nav-map-loading/.test(css)) failures.push('map loader missing');
for (const file of ['labels-major.geojson','labels-poi.geojson','labels-detail.geojson','labels-native.geojson','labels.compact.json','boundary.geojson','outside-mask.geojson']) {
  if (!fs.existsSync(`public/data/nav/${file}`)) failures.push(`missing map asset: ${file}`);
}
if (manifest.release !== '2026-07-22-qalla-wanan-r11-nav-capsule-satellite-gps') failures.push('manifest release mismatch');
if (manifest.source_records !== 69000 || manifest.render_records !== 69000) failures.push('69,000 record contract failed');
if (manifest.coordinate_mutation !== 0 || manifest.outside_canonical_boundary !== 0) failures.push('coordinate/boundary contract failed');
if (failures.length) throw new Error(`runtime contract failed:\n- ${failures.join('\n- ')}`);
console.log(JSON.stringify({
  ok:true,
  contract:'R11-NAV-CAPSULE-SATELLITE-GPS-69000',
  renderer:'MapLibre native WebGL symbol layers',
  labelBackground:'compact dark translucent nine-slice capsule',
  fixedCoordinates:true,
  satelliteOnly:true,
  gps:true,
  route:true,
  sourceRecords:manifest.source_records,
  renderRecords:manifest.render_records,
  coordinateMutation:manifest.coordinate_mutation,
  outsideCanonicalBoundary:manifest.outside_canonical_boundary
}, null, 2));
