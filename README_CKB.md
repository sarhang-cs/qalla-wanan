# Qalla Wanan — NAV KURD R11 Glass 69,000

ئەم وەشانە **69,000 تۆماری سەرچاوەپشتڕاستکراو** لە ناو نەخشەکەدا هەیە:

- 47,040 تۆماری بنەڕەتی بەبێ سڕینەوە پارێزراون.
- 21,960 تۆماری نوێ لە OpenStreetMap/Geofabrik و GeoNames IQ + alternateNamesV2 زیاد کراون.
- تۆماری فەیک، placeholder یان coordinate ـی دروستکراوی دەستی زیاد نەکراوە.
- تۆماری دەرەوەی سنووری canonical: 0
- coordinate mutation: 0
- ID ـی دووبارەی render: 0

## ڕووکاری ناوەکان

- ناوەکان native MapLibre/WebGL symbol layer ـن؛ Overlay، DOM Marker یان Canvas label renderer نین.
- هەر ناوێک لە هەمان longitude/latitude ـی سەرچاوەکەی خۆی جێگیرە.
- بۆکسەکان native nine-slice glass image ـن و بە `icon-text-fit: both` لەگەڵ قەبارەی دەق گەورە و بچووک دەبن.
- هیچ border/halo ـی ڕەش لە دەوری نووسین نییە.
- فۆنتی UniQAIDAR Hewal 031 لە ناو پەکەجەکەدایە.
- ناوەکان لە سێ source ـی جێگیر بار دەبن: major، POI و detail؛ لە zoom/pan دا `setData` ناکرێت.

## Variable ـە پێویستەکان

- `VITE_MAPTILER_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

هیچ Variable یان SQL ـی نوێ بۆ R11 پێویست نییە.

## دامەزراندن لە Termux

`TERMUX_INSTALL_R11_AND_PUSH.sh` جێبەجێ بکە. سکریپتەکە `.git` و `.env.local` دەپارێزێت و تەنها بۆ `sarhang-cs/qalla-wanan` push دەکات.


## R11 NAV KURD capsule map
- Compact dark translucent capsules matching the supplied NAV KURD reference.
- White Kurdish labels with no black text border.
- Fixed native MapLibre coordinates; no DOM/canvas label overlay.
- Satellite-only basemap; GPS and route remain native.
- All 69,000 source-linked records remain in native map sources and search.
