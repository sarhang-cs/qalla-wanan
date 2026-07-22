const cfg = () => window.__APP_CONFIG__ || {};


async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanPlace(row) {
  const lng = Number(row.longitude ?? row.lng);
  const lat = Number(row.latitude ?? row.lat);
  const name = String(row.name_ku || row.name || row.name_en || row.name_ar || '').trim();
  if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const context = [row.category_ku || row.category, row.admin_district_ku, row.admin_governorate_ku]
    .filter(Boolean).join(' · ');
  return [
    `db-${row.id}`, name, lng, lat, 'custom',
    Number(row.min_zoom ?? 11.5), Number(row.priority ?? 260),
    context, String(row.category_ku || row.category || 'شوێن')
  ];
}

async function fromSupabase(config) {
  const url = String(config.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = config.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const select = 'id,name_ku,name_ar,name_en,category,category_ku,latitude,longitude,admin_governorate_ku,admin_district_ku,priority,min_zoom,status';
  const endpoint = `${url}/rest/v1/places?select=${encodeURIComponent(select)}&status=eq.published&limit=10000`;
  const headers = { apikey: key, Accept: 'application/json' };
  // New sb_publishable_* keys are public browser keys, but they are not JWTs.
  // Only legacy anon JWT keys belong in Authorization: Bearer.
  if (!String(key).startsWith('sb_publishable_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetchWithTimeout(endpoint, { headers, credentials: 'omit' }, 8000);
  if (!response.ok) throw new Error(`Supabase REST HTTP ${response.status}`);
  return (await response.json()).map(cleanPlace).filter(Boolean);
}

async function fromMysqlApi(config) {
  const base = String(config.VITE_MYSQL_API_BASE_URL || '').replace(/\/$/, '');
  if (!base) return [];
  const response = await fetchWithTimeout(`${base}/places.php?status=published`, {
    headers: { Accept: 'application/json' }, credentials: 'omit'
  }, 8000);
  if (!response.ok) throw new Error(`MySQL API HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : (payload.data || []);
  return rows.map(cleanPlace).filter(Boolean);
}

export async function loadPublishedPlaces() {
  const config = cfg();
  const mode = String(config.VITE_BACKEND_MODE || 'supabase').toLowerCase();
  try {
    return mode === 'mysql' ? await fromMysqlApi(config) : await fromSupabase(config);
  } catch (error) {
    console.warn('[NAV backend] published places unavailable:', error);
    return [];
  }
}
