// Pruebas de Code.gs contra el libro real exportado a JSON.
// Uso: node test/backend.test.js <wb.json>
const assert = require('assert');
const { loadWorkbook, createGas } = require('./fake-gas');

const wbPath = process.argv[2];
let ss = loadWorkbook(wbPath);
let gas = createGas(ss);
const call = (req) => {
  const res = gas.api(req);
  return JSON.parse(JSON.stringify(res));
};
const cat = (name, data) => data.categorias.find(c => c.sheet === name);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok -', name); };

const catalog = call({ action: 'catalog' });
test('catálogo completo', () => {
  assert.ok(catalog.ok);
  assert.strictEqual(catalog.categorias.length, 47);
  assert.strictEqual(catalog.datos.obra, 'COMAFI Reconquista');
  assert.strictEqual(catalog.datos.responsables.length, 5);
  assert.ok(!catalog.categorias.some(c => c.sheet === '_PIE_LOG'));
});

const c6 = cat('6', catalog);
const last6 = c6.registros[c6.registros.length - 1];

test('crear registro en hoja 6 debajo del último', () => {
  const items = {};
  items[last6.items[0][0]] = { criterio: c6.crit[last6.items[0][1]][3], estado: 'AP', fecha: '2026-10-17', resp: 'FC', documento: 'PLANO-01' };
  items[last6.items[1][0]] = { criterio: c6.crit[last6.items[1][1]][3], fecha: 'NA', resp: 'FC' };
  const res = call({
    action: 'batch', ops: [{
      id: 'op-1', op: 'create', sheet: '6', by: 'FC', base: { h: last6.h, sig: last6.sig },
      header: { responsables: ['FEDERICO CALZON', 'MARIO PEDROZA', 'N/A'], piso: 'SS3', sector: 'Núcleo', etapa: '2', elemento: 'Tabique T4' },
      items
    }]
  });
  assert.ok(res.ok, JSON.stringify(res));
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const nc6 = cat('6', res);
  assert.strictEqual(nc6.registros.length, c6.registros.length + 1);
  const nr = nc6.registros[nc6.registros.length - 1];
  // gap de la hoja 6 = 1 fila, último bloque termina en 805 => nuevo encabezado en 807, TAREA en 812
  assert.strictEqual(nr.s, 807);
  assert.strictEqual(nr.h, 812);
  assert.strictEqual(res.results[0].h, 812);
  assert.strictEqual(nr.elemento, 'Tabique T4');
  assert.strictEqual(nr.piso, 'SS3');
  assert.strictEqual(nr.sector, 'Núcleo');
  assert.strictEqual(nr.etapa, '2');
  assert.deepStrictEqual(nr.resp, ['FEDERICO CALZON', 'MARIO PEDROZA', 'N/A']);
  assert.strictEqual(nr.items.length, last6.items.length);
  assert.deepStrictEqual(nr.items[0].slice(2, 6), ['PLANO-01', '2026-10-17', 'FC', 'AP']);
  assert.deepStrictEqual(nr.items[1].slice(3, 6), ['NA', 'FC', '']);
  // el resto de las columnas de carga quedan limpias (el modelo tenía datos cargados)
  assert.ok(nr.items.slice(2).every(it => it.slice(2).every(v => v === '')), 'columnas de carga limpias');
  const sh = ss.getSheetByName('6');
  assert.strictEqual(sh.cell(808, 1).f, '=IFERROR(VLOOKUP(B808,DATOS!$D$12:$E$60,2,0),"")');
  assert.ok(sh.merges.some(m => m.r1 === 808 && m.c1 === 7 && m.c2 === 11), 'merge G:K del elemento copiado');
  assert.strictEqual(sh.heights[812], sh.heights[759], 'alto de fila copiado');
  assert.strictEqual(sh.fmt(813, 8).nf, 'dd/mm/yy');
  // el bloque anterior no se tocó
  assert.strictEqual(sh.cell(805, 4).v, '± 10mm. Respecto a la horizontal en losas y escaleras. Espesor mínimo según planos ');
});

test('reintento de la misma operación no duplica', () => {
  const res = call({ action: 'batch', ops: [{ id: 'op-1', op: 'create', sheet: '6', header: { elemento: 'X' }, items: {} }] });
  assert.ok(res.results[0].dup);
  assert.strictEqual(cat('6', res).registros.length, c6.registros.length + 1);
});

test('actualizar ítems de un registro existente (hoja 10)', () => {
  const c10 = cat('10', catalog);
  const r = c10.registros[1];
  const it = r.items[2];
  const res = call({
    action: 'batch', ops: [{
      id: 'op-2', op: 'update', sheet: '10', h: r.h, sig: r.sig, elemento: r.elemento,
      items: { [it[0]]: { criterio: c10.crit[it[1]][3], estado: 'RZ', fecha: '2026-10-16', resp: 'MP', fum: '12', obs: 'Falta junta' } }
    }]
  });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const nr = cat('10', res).registros[1];
  assert.deepStrictEqual(nr.items[2].slice(3), ['2026-10-16', 'MP', 'RZ', '12', 'Falta junta']);
  assert.deepStrictEqual(nr.items[0], r.items[0], 'otros ítems intactos');
});

test('update con offset corrido se resuelve por texto del criterio', () => {
  const c10 = cat('10', call({ action: 'sheet', sheet: '10' }) && call({ action: 'catalog' }));
  const r = c10.registros[2];
  const it = r.items[4];
  const res = call({
    action: 'batch', ops: [{
      id: 'op-3', op: 'update', sheet: '10', h: r.h, sig: r.sig,
      items: { [it[0] + 1]: { criterio: c10.crit[it[1]][3], tarea: c10.crit[it[1]][1], estado: 'AP' } }
    }]
  });
  assert.ok(res.results[0].ok);
  const nr = cat('10', res).registros[2];
  assert.strictEqual(nr.items[4][5], 'AP');
  assert.strictEqual(nr.items[5][5], r.items[5][5]);
});

test('hoja 20: el modelo prefiere el último bloque con título RESPONSABLE', () => {
  const c20 = cat('20', catalog);
  const res = call({ action: 'batch', ops: [{ id: 'op-4', op: 'create', sheet: '20', header: { elemento: 'Puertas 5P', piso: '5P', responsables: ['FEDERICO CALZON'] }, items: {} }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const nr = cat('20', res).registros.slice(-1)[0];
  assert.strictEqual(nr.s, 509); // último bloque termina en 507, gap 1
  assert.strictEqual(nr.h, 514);
  assert.strictEqual(nr.elemento, 'Puertas 5P');
  assert.deepStrictEqual(nr.resp, ['FEDERICO CALZON', '', '']);
  assert.strictEqual(ss.getSheetByName('20').cell(509, 2).v, 'RESPONSABLE');
  assert.strictEqual(cat('20', res).registros.length, c20.registros.length + 1);
});

test('hoja 20: modelo pedido sin título -> usa uno titulado igual y guarda el elemento', () => {
  const c20 = cat('20', call({ action: 'catalog' }));
  const last = c20.registros.find(x => x.h === 491); // bloque sin título RESPONSABLE
  assert.ok(last);
  const res = call({ action: 'batch', ops: [{ id: 'op-4b', op: 'create', sheet: '20', base: { h: last.h, sig: last.sig }, header: { elemento: 'Puertas 6P' }, items: {} }] });
  assert.ok(res.results[0].ok);
  const nr = cat('20', res).registros.slice(-1)[0];
  assert.strictEqual(nr.elemento, 'Puertas 6P');
  assert.strictEqual(ss.getSheetByName('20').cell(nr.s, 2).v, 'RESPONSABLE');
});

test('bloque existente sin título: el elemento se puede editar (fila PISO, col. G)', () => {
  const c20 = cat('20', call({ action: 'catalog' }));
  const r = c20.registros.find(x => x.h === 425);
  const res = call({ action: 'batch', ops: [{ id: 'op-4c', op: 'update', sheet: '20', h: 425, sig: r.sig, header: { elemento: 'Puertas 1SS' } }] });
  assert.ok(res.results[0].ok);
  assert.strictEqual(ss.getSheetByName('20').cell(421, 7).v, 'Puertas 1SS');
  assert.strictEqual(cat('20', res).registros.find(x => x.h === 425).elemento, 'Puertas 1SS');
});

test('hoja 16 (columnas RESP/ESTADO corridas a L/M)', () => {
  const c16 = cat('16', catalog);
  const base = c16.registros.slice(-1)[0];
  const it = base.items[0];
  const res = call({
    action: 'batch', ops: [{
      id: 'op-5', op: 'create', sheet: '16', header: { elemento: 'Cielorraso PB' },
      items: { [it[0]]: { criterio: c16.crit[it[1]][3], estado: 'AP', resp: 'MP', fecha: '2026-10-01' } }
    }]
  });
  assert.ok(res.results[0].ok);
  const nr = cat('16', res).registros.slice(-1)[0];
  assert.deepStrictEqual(nr.items[0].slice(3, 6), ['2026-10-01', 'MP', 'AP']);
  const sh = ss.getSheetByName('16');
  assert.strictEqual(sh.cell(nr.h + it[0], 13).v, 'AP');
  assert.strictEqual(sh.cell(nr.h + it[0], 12).v, 'MP');
});

test('crear en hoja oculta la vuelve visible', () => {
  assert.ok(ss.getSheetByName('3').hidden);
  const res = call({ action: 'batch', ops: [{ id: 'op-6', op: 'create', sheet: '3', header: { elemento: 'Excavación' }, items: {} }] });
  assert.ok(res.results[0].ok);
  assert.ok(!ss.getSheetByName('3').hidden);
  const nr = cat('3', res).registros;
  assert.strictEqual(nr.length, 2);
  assert.strictEqual(nr[1].s, 30 + 2 + 1); // un solo bloque: gap por defecto 2
});

test('update referenciando un create por id', () => {
  const res = call({ action: 'batch', ops: [{ id: 'op-7', op: 'update', sheet: '3', ref: 'op-6', items: { 1: { estado: 'AP' } } }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  assert.strictEqual(cat('3', res).registros[1].items[0][5], 'AP');
});

test('errores: hoja inexistente y clave', () => {
  const res = call({ action: 'batch', ops: [{ id: 'op-8', op: 'create', sheet: 'DATOS', items: {} }] });
  assert.ok(!res.results[0].ok);
  assert.strictEqual(res.results[0].code, 'not_found');
  gas = createGas(ss, { PIE_TOKEN: 'secreto' });
  assert.strictEqual(call({ action: 'catalog' }).code, 'auth');
  assert.ok(call({ action: 'catalog', token: 'secreto' }).ok);
});

test('doGet sirve la app y doPost responde JSON', () => {
  const html = gas.doGet({ parameter: {} }).getContent();
  assert.ok(html.includes('window.PIE_BOOT={"mode":"webapp"'));
  const out = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action: 'ping', token: 'secreto' }) } }).getContent());
  assert.ok(out.ok);
});

console.log(`\n${passed} pruebas OK`);
