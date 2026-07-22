import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const requested = process.argv[2];
const port = Number(process.argv[3] || (requested === 'dist' ? 4173 : 5173));
if (requested !== 'dist') {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
const base = path.resolve(requested === 'dist' ? 'dist' : 'dist');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const raw = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(base, raw === '/' ? 'index.html' : raw.replace(/^\//,''));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(base,'index.html');
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', ext === '.json' || ext === '.geojson' ? 'no-cache' : 'no-store');
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '0.0.0.0', () => console.log(`http://127.0.0.1:${port}`));
