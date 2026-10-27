// Pruebas de la 2.3.0 contra el libro real (PIE + FOD 02) con el simulador de Apps Script.
// Uso: PIE_VER=. PIE_PLANOS=<carpeta planos> node herramientas/test-v2/final.test.js <wb.json> <fod.json>
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadWorkbook, createGas } = require('./fake-gas');
const FOD = 'FODID0000000000000000000';
const ss = loadWorkbook(process.argv[2]);
const books = { [FOD]: loadWorkbook(process.argv[3]) };
const gas = createGas(ss, { PIE_TOKEN: 't', FOD02_ID: FOD }, { books, files: { [FOD]: { mime: 'application/vnd.google-apps.spreadsheet', name: 'FOD' } } });
const call = req => JSON.parse(JSON.stringify(gas.api(Object.assign({ token: 't' }, req))));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok -', name); };
const hoy = gas.Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
const cat = call({ action: 'catalog' });
const c6 = cat.categorias.find(c => c.sheet === '6');
const r = c6.registros.find(x => x.h === 706) || c6.registros[0];
const jpg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';

ok('reglas de liberación idénticas en Beta.gs y en la app', () => {
  const g = s => s.slice(s.indexOf('/* <reglas-liberacion>'), s.indexOf('/* </reglas-liberacion> */'));
  const a = g(fs.readFileSync(path.join(__dirname, '../../apps-script/Beta.gs'), 'utf8'));
  const b = g(fs.readFileSync(path.join(__dirname, '../../pwa/index.html'), 'utf8'));
  assert.ok(a.length > 1000 && a === b);
});

ok('foto sacada sin señal: el índice guarda el día de la toma (no el del envío) y la nota sin apóstrofo en Drive', () => {
  const res = call({ action: 'batch', ops: [{ id: 'fot-1', op: 'photo', scope: 'registro', sheet: '6', h: r.h, sig: r.sig, elemento: r.elemento,
    mime: 'image/jpeg', data: jpg, by: 'FC', takenAt: '2026-10-21T10:15:00', nota: '+2 cm de recubrimiento' }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const fotos = call({ action: 'catalog' }).categorias.find(c => c.sheet === '6').registros.find(x => x.h === r.h).fotos;
  const all = [].concat(...Object.values(fotos));
  const f = all.find(x => x[4] === '+2 cm de recubrimiento' || x[4] === "'+2 cm de recubrimiento");
  assert.ok(f, JSON.stringify(all.slice(-2)));
  assert.strictEqual(f[2], '2026-10-21');
  // fecha adelantada del celular → hoy
  const res2 = call({ action: 'batch', ops: [{ id: 'fot-2', op: 'photo', scope: 'registro', sheet: '6', h: r.h, sig: r.sig, mime: 'image/jpeg', data: jpg, by: 'FC', takenAt: '2099-01-01T10:00:00' }] });
  assert.ok(res2.results[0].ok);
  const all2 = [].concat(...Object.values(call({ action: 'catalog' }).categorias.find(c => c.sheet === '6').registros.find(x => x.h === r.h).fotos));
  assert.strictEqual(all2[all2.length - 1][2], hoy);
});

ok('lote de 26 de una app vieja: se procesan 25 y la última vuelve como «retry» (no se rechaza todo)', () => {
  const ops = Array.from({ length: 26 }, (_, i) => ({ id: 'lote-' + i, op: 'update', sheet: '6', h: r.h, sig: r.sig, elemento: r.elemento, items: {} }));
  const res = call({ action: 'batch', ops });
  assert.ok(res.ok);
  assert.strictEqual(res.results.length, 26);
  assert.ok(res.results.slice(0, 25).every(x => x.ok), JSON.stringify(res.results.find(x => !x.ok)));
  assert.strictEqual(res.results[25].code, 'retry');
});

ok('zona con doble toque en un vértice: se junta y se guarda', () => {
  gas.planosFolder_(ss);   // crea la carpeta de fotos y su subcarpeta Planos (la del simulador lee PIE_PLANOS)
  const plano = call({ action: 'catalog' }).planos.find(p => p.planilla === '6');
  assert.ok(plano, 'hay un plano para la planilla 6');
  const res = call({ action: 'batch', ops: [{ id: 'zona-1', op: 'pin', accion: 'poner', pin: 'z1', sheet: '6', plano: plano.id, h: r.h, sig: r.sig, elemento: r.elemento,
    x: .15, y: .15, by: 'FC', pts: [[.1, .1], [.2, .1], [.2, .1], [.2, .2]] }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const z = res.pines.find(p => p[0] === 'z1');
  assert.strictEqual(z[11].length, 3);
});

ok('corregir el «Elemento» del registro no desvincula sus pines', () => {
  const res = call({ action: 'batch', ops: [{ id: 'hdr-1', op: 'update', sheet: '6', h: r.h, sig: r.sig, elemento: r.elemento, header: { elemento: 'Bajo recorrido corregido' } }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const z = call({ action: 'catalog' }).pines.find(p => p[0] === 'z1');
  assert.strictEqual(z[6], 'Bajo recorrido corregido');
});

ok('liberación: fecha de la decisión, avisos anotados y sin duplicar', () => {
  // un registro con una etapa liberable según las reglas comunes
  let pick = null;
  for (const c of call({ action: 'catalog' }).categorias) {
    for (const rg of c.registros) {
      const items = rg.items.map(x => { const k = c.crit[x[1]]; return { off: x[0], etapa: k[0], instrumento: x[8] || k[5], documento: x[2], fecha: x[3], resp: x[4], estado: x[5], fum: x[6] }; });
      for (const e of [...new Set(items.map(i => i.etapa || '—'))]) {
        const its = items.filter(i => (i.etapa || '—') === e);
        const chk = gas.RL.check(its, { hoy, sheet: c.sheet, h: rg.h, docs: cat.fod.docs, fodOk: true, equipos: [], fums: [] });
        if (!chk.errores.length && chk.ap && chk.ultima && chk.ultima < hoy) { pick = { c, rg, e, ultima: chk.ultima }; break; }
      }
      if (pick) break;
    }
    if (pick) break;
  }
  assert.ok(pick, 'hay una etapa liberable');
  const op = { id: 'lib-ok', op: 'liberar', sheet: pick.c.sheet, h: pick.rg.h, sig: pick.rg.sig, elemento: pick.rg.elemento, etapa: pick.e, by: 'FC', fecha: pick.ultima };
  const res = call({ action: 'batch', ops: [op] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const lib = res.liberaciones.find(l => l[0] === pick.c.sheet && l[1] === pick.rg.h && l[2] === pick.e);
  assert.strictEqual(lib[3], pick.ultima, 'fecha de la decisión');
  const again = call({ action: 'batch', ops: [Object.assign({}, op, { id: 'lib-ok-2' })] });
  assert.ok(again.results[0].ok && /ya estaba liberada/.test(again.results[0].warnings[0]));
  assert.strictEqual(again.liberaciones.filter(l => l[0] === pick.c.sheet && l[1] === pick.rg.h && l[2] === pick.e).length, 1);
});

ok('liberación bloqueada por el servidor con un motivo claro (control controlado con revisión superada)', () => {
  const c = cat.categorias.find(c => c.registros.some(rg => rg.items.some(x => /S12P-R06|SP-R00/.test(x[2]))));
  if (!c) return;
  const res = call({ action: 'batch', ops: [{ id: 'lib-no', op: 'liberar', sheet: '6', h: r.h, sig: r.sig, etapa: 'PRE', by: 'FC' }] });
  assert.ok(!res.results[0].ok && res.results[0].code === 'release_blocked' && /No se puede liberar/.test(res.results[0].error), JSON.stringify(res.results[0]));
});

console.log('\n' + n + ' pruebas OK');
