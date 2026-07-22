# Qalla Wanan — NAV KURD Map R7

ئەم وەشانە چارەسەری بنەڕەتیی کێشەکانی نووسینی کوردی، جێگیری ناوەکان، گلیچی Zoom، بارکردن و ساتەلایتە.

## تەکنەلۆجیا

- JavaScript ES Modules
- MapLibre GL JS 5.24.0 و WebGL
- MapLibre RTL Text Plugin بۆ Bidi و Arabic shaping ـی کوردی/عەرەبی
- GeoJSON source و native symbol/circle/line layers
- Supabase: PostgreSQL + RLS؛ PostGIS لە migration ـی 002 بۆ شوێنە زیادکراوەکانی داهاتوو
- GitHub Actions + GitHub Pages

## گۆڕانکارییە بنەڕەتییەکان

1. ناوەکان DOM یان Canvas overlay نین؛ هەموویان native MapLibre symbol layer ـن.
2. RTL plugin پێش دروستکردنی map بار دەبێت و loader چاوەڕێی تەواوبوونی دەکات.
3. coordinate ـی هیچ تۆمارێک لە runtime ناگۆڕدرێت.
4. `text-allow-overlap=false` و collision index ـی MapLibre ڕێگری لە تێکچوونی ناوەکان دەکات.
5. `fadeDuration=0`، fixed center anchor و `renderWorldCopies=false` گلیچی ناوەکان لە Zoom/Pan کەم دەکات.
6. داتای render بۆ دوو source ـی کەم‌قەبارە دابەش کراوە: major و POI.
7. source ـی GeoJSON لە z14 overzoom دەکرێت؛ ئەمە worker load و إعادة-tiling لە deep zoom کەم دەکات.
8. worker pool بەپێی CPU/RAM ـی ئامێر ڕێکدەخرێت.
9. ساتەلایتی Esri تەنها تا native z17 داوا دەکرێت و لە deep zoom overzoom دەکرێت، بۆیە tile ـی خاکستەری “Map data not yet available” داوا ناکرێت.
10. mask و boundary لە یەکەم frame ـەوە لە style ـدا هەن، نەک دوای باربوون.
11. GPS marker، accuracy و route هەموویان native GeoJSON layers ـن.
12. loader چاوەڕێی font، RTL، major labels، POI labels، search catalog و map idle دەکات.

## داتا

- سەرچاوەی تۆمارەکان: 47,040
- تۆماری render: 46,827
- هەموو 47,040 تۆمارەکە لە search catalog و full source ماون.
- 213 نمایشەی نزیک-دووبارە تەنها لە render suppression کراون؛ سڕاونەتەوە نین.
- coordinate mismatch: 0
- تۆماری دەرەوەی canonical boundary: 0
- full-source map assets: زیاتر لە 63 MB

ئەم ژمارانە دڵنیایی لە integrity ـی پەکەج دەدەن، بەڵام مانای ئەوە نییە هەموو ناوەکانی OSM/GeoNames لە ڕووی واقیعی و زمانەوانی 100% بێهەڵەن؛ ئەو audit ـە بەشی داتای سەرچاوەیی جیاوازە.

## Variable ـە پێویستەکان

لە GitHub → Settings → Secrets and variables → Actions → Variables:

```text
VITE_MAPTILER_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Variable ـی نوێ پێویست نییە. `service_role`، database password یان secret key هەرگیز مەخەرە frontend/GitHub Pages.

## Supabase

`001_initial_schema.sql` پێشتر بۆ خشتە و RLS ـە.

`002_map_performance.sql` optional ـە و بۆ شوێنە dynamic ـەکانی داهاتوو PostGIS، spatial index و bbox RPC زیاد دەکات. بۆ 47,040 تۆماری static ـی ناو پەکەج پێویست نییە.

## دامەزراندن لە Termux

ZIP ـەکە بخەرە Downloads و `TERMUX_INSTALL_R7_AND_PUSH.sh` جێبەجێ بکە. سکریپتەکە:

- backup دروست دەکات؛
- `.git` و `.env.local` پارێزراو دەهێڵێتەوە؛
- تەنها repo ـی `sarhang-cs/qalla-wanan` بەکار دەهێنێت؛
- check و build دەکات؛
- پاشان push دەکات.
