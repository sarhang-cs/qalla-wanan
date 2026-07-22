# Qalla Wanan — NAV KURD R9

ئەم وەشانە ناوی شوێنەکان بە دوو سەرچاوەی GeoJSON ـی جێگیر لە ناو style ـی سەرەتایی MapLibre دەخات:

- `labels-major.geojson`: شار، شارۆچکە، گوند، ناوچە، سروشت و ڕێگا
- `labels-poi.geojson`: دوکان، قوتابخانە، نەخۆشخانە، مزگەوت، خزمەتگوزاری و POI

هیچ DOM marker، Canvas overlay، viewport shard replacement یان `setData` ـی ناوەکان لە کاتی zoom/pan بەکارنەهاتووە. Search دوای ئامادەبوونی نەخشە بار دەبێت.

## داتا

- سەرجەم تۆماری سەرچاوە: 47,040
- تۆماری native render: 46,827
- تۆماری دووبارەی نیشاندان کە suppression کراوە: 213
- coordinate mutation: 0
- تۆماری دەرەوەی سنووری canonical: 0

## Variable ـەکان

- `VITE_MAPTILER_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## دامەزراندن لە Termux

`TERMUX_INSTALL_R9_AND_PUSH.sh` جێبەجێ بکە. سکریپتەکە تەنها بۆ `sarhang-cs/qalla-wanan` push دەکات.
