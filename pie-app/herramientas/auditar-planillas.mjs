import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Uso: node herramientas/auditar-planillas.mjs <exportacion.json>');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const c = vm.createContext({console});
for (const file of ['Code.gs', 'Beta.gs']) {
  vm.runInContext(fs.readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8'), c);
}
const properties = new Map();
c.PropertiesService = {getScriptProperties: () => ({getProperty: k => properties.get(k) || '', setProperty: (k,v) => properties.set(k,v)})};
c.Session = {getScriptTimeZone: () => 'America/Argentina/Buenos_Aires'};
const makeBook = values => ({getSheets: () => Object.entries(values).map(([name, rows]) => ({
  getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(1,...rows.map(r=>r.length)),
  getRange: (r,col,n,m) => ({getValues: () => rows.slice(r-1,r-1+n).map(a=>a.slice(col-1,col-1+m))})
}))});
const categories = [];
for (const [name, values] of Object.entries(data.PIE)) {
  if (!c.isCategorySheet_(name)) continue;
  const p = c.parseSheet_(values);
  assert.ok(p.blocks.length > 0, 'Categoría sin bloques: ' + name);
  const cat = c.toClientCategory_(name, p, false, {});
  assert.equal(cat.registros.length, p.blocks.length);
  for (const b of p.blocks) {
    assert.ok(b.tareaRow >= 1 && b.endRow <= values.length);
    assert.ok(b.items.length > 0, 'Bloque sin criterios: ' + name + ':' + b.tareaRow);
    assert.ok(b.items.every(it => it.off > 0 && b.tareaRow + it.off <= b.endRow));
  }
  categories.push({planilla:name, registros:p.blocks.length, controles:p.blocks.reduce((n,b)=>n+b.items.length,0)});
}
assert.ok(categories.length > 0);
const fod = c.parseFod_(data.FOD['FOD-02']);
assert.ok(fod.docs.length > 0 && !fod.aviso);
const fog = c.fogInfo_(makeBook(data.FOG));
for (const k of ['num','desc','fecha','cierre','fechaCierre']) assert.ok(fog.cols[k], 'Columna faltante de FOG: '+k);
const pieBook = makeBook(data.PIE);
pieBook.getSheetByName = name => pieBook.getSheets().find(s=>s.getName()===name);
const equipos = c.readEquipos_(pieBook);
const summary = {categorias:categories.length, registros:categories.reduce((n,s)=>n+s.registros,0),
  controles:categories.reduce((n,s)=>n+s.controles,0), documentosFOD:fod.docs.length,
  encabezadoFOG:fog.headerEnd, columnasFOG:fog.cols, equipos:equipos.length,
  equiposSinVencimiento:equipos.filter(e=>!e.vence).length, detalle:categories};
console.log(JSON.stringify(summary,null,2));
console.log('OK: lectores de PIE, FOD y FOG ejecutados con los valores de los XLSX, sin escribir en Google ni en los libros.');
