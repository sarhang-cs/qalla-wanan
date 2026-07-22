# Qalla Wanan — R5 Native Map Data

ئەم وەشانە سیستەمی Canvas/DOM overlay ـی ناوی شوێنەکان بە تەواوی لابردووە. هەموو ناوەکان لە `labels-native.geojson` وەک source ـی نەخشە دەچنە ناو MapLibre و بە `symbol` layer ـی WebGL دەردەکەون.

## گرنگترین قراردادەکان

- هەر ناوێک بە longitude/latitude ـی سەرچاوەکەی خۆی بەستراوە.
- Zoom، pan، GPS، route، collision و 3D coordinate ناگۆڕن.
- `fadeDuration: 0` ـە؛ ناوەکان بە هێواشی لە شوێنێکەوە بۆ شوێنێکی تر ناگەڕێنەوە.
- `text-variable-anchor` و offset ـی گۆڕاو بەکارنەهاتووە.
- mask لە سەر label layer ـەکانە؛ هیچ بەشی دەق لە دەرەوەی canonical boundary نابینرێت.
- GPS marker و route line هەردووکیان native GeoJSON layers ـن؛ DOM marker نییە.
- هەموو 47,040 source record لە native map source ـدا ماون.
- 8 تۆماری city/town کە دوو سەرچاوە هەمان شوێنیان نیشان دەدا تەنها لە render پاشەکشە کراون؛ تۆمارە سەرچاوەکان نەسڕاونەتەوە.
- ناوی پارێزگا بە `پارێزگای ...` نیشان دەدرێت تا centroid ـی پارێزگا لە ناوی شاری هەمان ناو جیا بکرێتەوە.

## داتای ناو پەکەج

- `labels-native.geojson`: 47,040 point feature، نزیکەی 20 MB.
- `labels.compact.json`: index ـی گەڕان، نزیکەی 7 MB.
- full source assets: PMTiles و GeoJSON ـەکانی localities، POI، natural و road labels، زیاتر لە 63 MB.
- `kri-base.pmtiles` و `kri-roads.pmtiles` بۆ offline/Hostinger و گەشەپێدانی داهاتوو پارێزراون؛ UI هەر Satellite-only ـە.

## Variable ـە پێویستەکان

- `VITE_MAPTILER_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

هیچ Variable ـی نوێ بۆ R5 پێویست نییە.

## GitHub

تەنها ئەم repository ـە بەکاردێت:

`https://github.com/sarhang-cs/qalla-wanan`
