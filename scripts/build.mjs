import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const envFiles = ['.env.local', '.env'];
const localEnv = {};
for (const file of envFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    localEnv[key] = value;
  }
}
const read = (key, fallback = '') => process.env[key] ?? localEnv[key] ?? fallback;
const config = {
  VITE_MAPTILER_KEY: read('VITE_MAPTILER_KEY'),
  VITE_BACKEND_MODE: read('VITE_BACKEND_MODE', 'supabase'),
  VITE_SUPABASE_URL: read('VITE_SUPABASE_URL'),
  VITE_SUPABASE_PUBLISHABLE_KEY: read('VITE_SUPABASE_PUBLISHABLE_KEY'),
  VITE_SUPABASE_ANON_KEY: read('VITE_SUPABASE_ANON_KEY'),
  VITE_ROUTING_BASE_URL: read('VITE_ROUTING_BASE_URL', 'https://router.project-osrm.org'),
  VITE_MYSQL_API_BASE_URL: read('VITE_MYSQL_API_BASE_URL'),
  VITE_MAP_DATA_VERSION: read('VITE_MAP_DATA_VERSION', '2026-07-23-qalla-wanan-r15-large-readable-rtl')
};

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const name of ['index.html', 'src', 'public']) {
  const source = path.join(root, name);
  if (name === 'public') {
    fs.cpSync(source, dist, { recursive: true });
  } else {
    fs.cpSync(source, path.join(dist, name), { recursive: true });
  }
}
fs.writeFileSync(path.join(dist, 'runtime-config.js'), `window.__APP_CONFIG__ = Object.freeze(${JSON.stringify(config)});\n`);
console.log(JSON.stringify({ ok: true, output: dist, config: { ...config, VITE_MAPTILER_KEY: config.VITE_MAPTILER_KEY ? '[set]' : '', VITE_SUPABASE_PUBLISHABLE_KEY: config.VITE_SUPABASE_PUBLISHABLE_KEY ? '[set]' : '', VITE_SUPABASE_ANON_KEY: config.VITE_SUPABASE_ANON_KEY ? '[set]' : '' } }, null, 2));
