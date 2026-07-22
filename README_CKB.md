# R2 Fix

- ناوی 47,040 شوێن لە GitHub Pages چاک کرا.
- دوگمەی پەڕەی سێیەمی دەستپێک لە مۆبایل چاک کرا.
- ڕێڕەوی فایلەکان بۆ GitHub Pages، Hostinger و localhost گشتی کرا.
- Publishable key ـی نوێی Supabase بە هێدەری دروست پشتیوانی دەکرێت.

# QALLA WANAN + NAV KURD MAP — R1

ئەم پڕۆژەیە `index (87).html` ـەکە وەک بنەمای UI پاراستووە و **تەنها تابی نەخشە**ی بە داتای NAV KURD گۆڕیوە.

## چی تێدایە؟

- ٤٧٬٠٤٠ ناوی شوێن لە داتای NAV KURD:
  - هەرێم و پارێزگا
  - شار و شارۆچکە
  - ٦٬٤٣٣ گوند
  - دوکان، قوتابخانە، نەخۆشخانە، مزگەوت، ڕێستورانت و POI ـەکان
  - شوێنە سروشتییەکان و ناوی ڕێگاکان
- هیچ cluster، خاڵی مۆر، بازنە، کارت یان ئایکۆنی شوێن نییە؛ تەنها ناوەکان دەردەکەون.
- نەخشە تەنها Satellite ـە.
- سنووری کوردستان و ناوچە جێناکۆکە هەڵبژێردراوەکان لە داتای NAV KURD پارێزراون؛ دەرەوەی سنوور تاریکە.
- ئەم سنوورە تەنها سنووری کارپێکردنی داتای ئەپە؛ بڕوانامەی یاسایی، سیاسی یان کاداستر نییە.
- Search، GPS، route line و 3D terrain هەن.
- Supabase و SQL ـی تازە ئامادەیە.
- Adapter ـی MySQL/Hostinger لە پێشوە دانراوە بۆ گواستنەوەی دواتر.

## ١) فۆنت دابنێ

فایلی فۆنتی خۆت لە Download هەیە. لە Termux:

```bash
termux-setup-storage
cd /path/to/qalla_wanan_nav_map_r1
bash scripts/install-font.sh "/sdcard/Download/UniQAIDAR_Hewal 031.ttf"
```

فۆنت دەچێتە:

```text
public/fonts/UniQAIDAR_Hewal_031.ttf
```

## ٢) تاقیکردنەوە لە Termux

```bash
pkg update -y
pkg install -y nodejs git
cd /path/to/qalla_wanan_nav_map_r1
cp .env.example .env.local
npm install
npm run check
npm run dev
```

دواتر لە browser ـی مۆبایلەکەت بکەرەوە:

```text
http://127.0.0.1:5173
```

## ٣) Variable ـە پێویستەکان

لە `.env.local` بۆ local و لە Vercel → Settings → Environment Variables بۆ production:

```env
VITE_MAPTILER_KEY=YOUR_PUBLIC_MAPTILER_KEY
VITE_BACKEND_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_ROUTING_BASE_URL=https://router.project-osrm.org
VITE_MYSQL_API_BASE_URL=
VITE_MAP_DATA_VERSION=2026-07-22-qalla-wanan-nav-map-r2
```

### تێبینی گرنگ

- `VITE_MAPTILER_KEY` بۆ Satellite ـی MapTiler و 3D terrain پێویستە. ئەگەر دانەنرێت، Satellite ـی Esri fallback کار دەکات، بەڵام 3D ناچالاک دەبێت. لە MapTiler key settings ـدا دۆمەینی Vercel/Hostinger ـەکەت سنووردار بکە.
- هیچ `service_role` ی Supabase لە Vercel یان browser مەخە. تەنها Publishable/Anon key.
- بۆ production باشترە routing endpoint ـی تایبەتی خۆت دابنێیت؛ endpoint ـی OSRM لێرە بۆ تاقیکردنەوەی یەکەمە.

## ٤) Supabase ـی تازە

1. پڕۆژەی تازە دروست بکە.
2. SQL Editor بکەرەوە.
3. ناوەڕۆکی ئەم فایلە جێبەجێ بکە:

```text
supabase/migrations/001_initial_schema.sql
```

4. URL و Publishable key بخەرە Vercel.
5. دوای یەکەم sign-in، لە کۆتایی SQL ـەکە فرمانی admin هەیە؛ email ـی خۆت تێدا دابنێ.

Table ـە سەرەکییەکان:

- `profiles`
- `places`
- `favorites`

`places.status` ئەمانە وەردەگرێت:

```text
pending | published | rejected | archived
```

تابی نەخشە تەنها ئەو شوێنانە دەخوێنێتەوە کە `status = published` ـیانە.

## ٥) Upload بۆ GitHub ـی qalla-wanan

لە ناو فۆڵدەری پڕۆژە:

```bash
bash TERMUX_PUSH_QALLA_WANAN.sh "$PWD"
```

سکریپتەکە build/check دەکات و پاشان بۆ ئەم repo ـە push دەکات:

```text
https://github.com/sarhang-cs/qalla-wanan.git
```

GitHub لە تۆ username/password یان Personal Access Token داوا دەکات؛ token لە هیچ فایلێکی پڕۆژەدا مەنووسە.

## ٦) Vercel

- Add New Project
- repo ـی `sarhang-cs/qalla-wanan` هەڵبژێرە
- Framework Preset: `Other`
- Build command: `npm run build`
- Output directory: `dist`
- Variable ـەکانی سەرەوە زیاد بکە
- Deploy

هەر گۆڕانێک لە Environment Variables دوای redeploy دەچێتە کار.

## ٧) گواستنەوەی دواتر بۆ Hostinger/MySQL

ئامادەکراوەکان:

```text
mysql/001_initial_schema_mysql.sql
hostinger-api/config.example.php
hostinger-api/places.php
```

ڕێکخستن:

1. SQL ـی MySQL جێبەجێ بکە.
2. `hostinger-api/config.example.php` کۆپی بکە بۆ `config.php` و DB credentials تێدا دابنێ.
3. فۆڵدەری API بخەرە hosting.
4. پێش build کردنی frontend لە Hostinger، لە `.env.local` بنووسە:

```env
VITE_BACKEND_MODE=mysql
VITE_MYSQL_API_BASE_URL=https://YOUR-DOMAIN.COM/api
```

Browser نابێت ڕاستەوخۆ بە MySQL پەیوەندی بکات؛ `places.php` وەک API ـی نێوانیان کار دەکات.

## ساختاری سەرەکی

```text
index.html
src/nav-map.js
src/nav-map.css
src/backend.js
public/data/nav/labels.compact.json
public/data/nav/boundary.geojson
public/data/nav/outside-mask.geojson
supabase/migrations/001_initial_schema.sql
mysql/001_initial_schema_mysql.sql
hostinger-api/
```
