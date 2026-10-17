// Corre el parser de Code.gs sobre el libro exportado a JSON y muestra un resumen.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
const ctx = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { parseSheet_, parseDatos_, toClientCategory_ } = ctx.module.exports;
const wb = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const plain = v => (v && typeof v === 'object') ? ('$d' in v ? v.$d : v.v) : v;
let cats = [];
for (const s of wb) {
  const vals = s.values.map(r => r.map(plain));
  if (s.name === 'DATOS') { console.log('DATOS', JSON.stringify(parseDatos_(vals))); continue; }
  const p = parseSheet_(vals);
  const c = toClientCategory_(s.name, p, s.hidden);
  cats.push(c);
  const b = p.blocks;
  console.log(s.name.padEnd(4), String(b.length).padStart(3), 'bloques', p.title.slice(0, 35).padEnd(35),
    b.map(x => `${x.startRow}/${x.tareaRow}-${x.endRow}:${x.items.length}${x.hasTitle ? '' : '*'}r${x.header.respCells.length}`).slice(-3).join(' '),
    '| elem:', JSON.stringify(b[b.length - 1].header.elemento).slice(0, 30), 'cols', JSON.stringify(b[0].cols));
}
const json = JSON.stringify(cats);
console.log('payload bytes', json.length);
if (process.argv[3]) fs.writeFileSync(process.argv[3], json);
