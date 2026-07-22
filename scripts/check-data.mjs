import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('public/data/nav/labels.compact.json','utf8'));
if(!Array.isArray(p.items)||p.items.length<40000) throw new Error(`label count too small: ${p.items?.length}`);
for(const row of p.items){if(row.length<9||!row[1]||!Number.isFinite(row[2])||!Number.isFinite(row[3])) throw new Error('invalid label row');}
for(const f of ['boundary.geojson','outside-mask.geojson']) JSON.parse(fs.readFileSync(`public/data/nav/${f}`,'utf8'));
console.log(JSON.stringify({ok:true,count:p.items.length,counts:p.counts,bbox:p.bbox},null,2));
