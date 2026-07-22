# QALLA WANAN + NAV KURD MAP — R4 GEO STABILITY

ئەم وەشانە چارەسەری پاشکۆ نییە. سیستەمی نیشاندانی ناو، GPS و هێڵی ڕێگا لە بنەڕەتەوە گۆڕدراوە بۆ ئەوەی هەموو شتێک بە **longitude/latitude ـی ڕاستەقینە** گرێدراو بێت و لەگەڵ Zoom، Pan، Pitch و 3D نەجوڵێتە شوێنێکی هەڵە.

## هۆکاری ڕاستەقینەی کێشەکە

لە وەشانی پێشوو:

- ناوی شوێنەکان بە DOM Marker دروست دەکران، نەک بە توێژی native/canvas ـی گرێدراو بە projection ـی نەخشە.
- لە هەر گۆڕانی Zoom ـدا ناوەکان لادەبران و دووبارە دروست دەکران؛ collision selection ـەکە وای دەکرد ناوەکان وەک ئەوەی شوێنیان گۆڕابێت دەربکەون.
- DOM Marker لە سەر canvas ـی نەخشە بوو، بۆیە mask و سنووری کوردستان نەتوانی دەقەکە clip بکات و بەشێکی ناو دەچووە دەرەوەی سنوور.
- GPS marker ـیش DOM ـی بوو و raw location fix ـەکان بەبێ فلتەری پێویست وەردەگیران، کە jitter و jump ـی دروست دەکرد.

## چارەسەری بنەڕەتی R4

### ١. ناوی شوێنەکان

- DOM Marker بە تەواوی لابراوە.
- هەموو ناوەکان لە `CanvasLabelLayer` ـدا لەسەر projection ـی MapLibre دەنووسرێن.
- هیچ کۆدێک longitude یان latitude ـی شوێن لە کاتی Zoom، collision، 3D یان render ناگۆڕێت.
- هەر ناوێک لە هەر frame ـێکدا لە هەمان coordinate ـی سەرچاوە project دەکرێت.
- چوار گۆشە و ناوەڕاستی bounding box ـی هەر دەقێک بە `unproject` دەگوازرێتەوە بۆ coordinates؛ ئەگەر یەک بەشی دەقەکە لە دەرەوەی سنووری canonical بێت، ناوەکە نانوسرێت.
- collision تەنها دیاری دەکات کام ناو لەو zoom ـەدا ببینرێت؛ شوێنی geographic ـی هیچ ناوێک ناگۆڕێت.
- Search و کلیککردن لەسەر ناوەکان پارێزراوە.

### ٢. GPS

- GPS marker ـی DOM لابراوە و بە GeoJSON source + MapLibre circle layers جێگیر کراوە.
- accuracy circle، halo، ring و dot هەموویان لە هەمان geographic point ـدا native render دەکرێن.
- jump ـی نامومکین ڕەت دەکرێتەوە.
- fix ـی زۆر لاواز ناتوانێت fix ـی باش تێکبدات.
- لە کاتی وەستاندا jitter ـی بچووک قوفڵ دەکرێت.
- smoothing بە accuracy و کاتی نێوان update ـەکان دەگۆڕێت، نەک بە ژمارەیەکی ساختە و جێگیر.

### ٣. هێڵی ڕێگا

- هێڵەکە native GeoJSON line layer ـە و بە پیکسڵ یان DOM ناچسپێنرێت.
- geometry ـی OSRM پێش نیشاندان validate دەکرێت.
- دەستپێک و کۆتایی route لەگەڵ GPS و destination بەراورد دەکرێن.
- request ـە کۆنەکان abort دەکرێن تا route ـەکان تێکەڵ نەبن.
- reroute تەنها دوای جوڵەی واتادار و ماوەی دیاریکراو ئەنجام دەدرێت.
- لە silent reroute ـدا viewport ناجوڵێت و route ـی پێشوو لە هەڵەی کاتیی network ـدا ناسڕێتەوە.

## Audit ـی داتا

- ژمارەی entity ـی نیشاندراو: **٤٧٬٠٤٠**
- هەموو ٤٧٬٠٤٠ entity ـەکە بە stable source ID لە canonical NAV KURD source ـەکانەوە بەستراون.
- exact ID match: **٤٧٬٠٤٠**
- exact name match: **٤٧٬٠٤٠**
- coordinate ـەکان بە full source precision دووبارە دروستکراون؛ rounding ـی شەش خانەی پێشوو لابراوە.
- entity لە دەرەوەی canonical boundary: **٠**
- duplicate display ID: **٠**
- یەک OSM node و building کە هەمان هۆتێلیان بە دوو feature نیشان دابوو، بە دڵنیایی لە یەک شوێنی sub-meter ـدا merge کراون؛ شوێنێک نەسڕاوەتەوە، تەنها duplicate ـی ساختە نیشان نادرێت.

سەرچاوە audit کراوەکان:

- `iraq-260713.osm.pbf`
- `iraq-260713-free.gpkg.zip`
- `IQ.zip`
- `alternateNamesV2.zip`
- canonical NAV KURD GeoJSON layers

وردەکاری و SHA-256 ـی سەرچاوەکان لە:

```text
public/data/nav/provenance-audit.json
```

## پشکنینە خۆکارەکان

`npm run check` ئەمانە بە زۆرەملێ پشکنین دەکات:

- هەموو item ـەکان coordinate ـی دروستیان هەبێت.
- هیچ item ـێک لە دەرەوەی سنوور نەبێت.
- ID دووبارە نەبێت.
- audit metadata لەگەڵ data یەکسان بێت.
- DOM MapLibre Marker لە runtime نەبێت.
- Canvas label projection و boundary clipping هەبێت.
- GPS و route بە native GeoJSON layers بن.
- فۆنتی `UniQAIDAR_Hewal_031.ttf` بە ڕاستی لە source و build ـدا هەبێت.

## Variable ـەکان

هیچ Variable ـی نوێ بۆ R4 پێویست نییە. هەمان سێ دانە بەسن:

```text
VITE_MAPTILER_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Variable ـە بنەڕەتییەکان لە workflow ـدا دانراون:

```text
VITE_BACKEND_MODE=supabase
VITE_ROUTING_BASE_URL=https://router.project-osrm.org
VITE_MAP_DATA_VERSION=2026-07-22-qalla-wanan-r4-geo-stability
```

`service_role`، database password یان secret key نابێت لە frontend/GitHub Pages دابنرێت.

## دامەزراندن و Push لە Termux

ZIP ـی R4 لە Downloads دابنێ و سکریپتی `TERMUX_INSTALL_R4_AND_PUSH.sh` جێبەجێ بکە. سکریپتەکە:

- پڕۆژەی ئێستا backup دەکات.
- تەواوی source ـی R4 جێگای source ـی کۆن دەگرێتەوە؛ patch ـی کۆتایی فایل نییە.
- `.git` و `.env.local` پارێزراو دەهێڵێتەوە.
- check و build دەکات.
- دڵنیادەبێتەوە origin تەنها ئەمەیە:

```text
https://github.com/sarhang-cs/qalla-wanan.git
```

- پاشان commit و push دەکات و GitHub Pages workflow خۆکارانە deploy دەکات.

## ساختاری گرنگ

```text
src/nav-map.js
src/nav-map.css
public/fonts/UniQAIDAR_Hewal_031.ttf
public/data/nav/labels.compact.json
public/data/nav/boundary.geojson
public/data/nav/outside-mask.geojson
public/data/nav/provenance-audit.json
scripts/check-data.mjs
scripts/check-runtime-contract.mjs
TERMUX_INSTALL_R4_AND_PUSH.sh
```

## سنووری دڵنیایی

ئەم وەشانە هیچ ناو یان coordinate ـێکی نوێ لە خۆیەوە دروست ناکات. هەر شتێک لە data ـدا هەیە بە سەرچاوەی canonical بەستراوە. «تەواوی هەموو شوێنەکانی جیهانی ڕاستەقینە» بە هیچ dataset ـێک ناتوانرێت بە ڕاستی گەرەنتی بکرێت؛ بەڵام هیچ entity ـێک لە ٤٧٬٠٤٠ رکۆردی سەرچاوەی ئەم build ـە لەبیرنەکراوە و هیچ fake record ـێک زیاد نەکراوە.
