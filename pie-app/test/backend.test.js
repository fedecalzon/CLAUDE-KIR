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

test('marcar RZ / N/A en celdas con validación "solo AP" (error de celda reportado)', () => {
  const sh = ss.getSheetByName('6');
  assert.ok(sh.dv.get('14,10'), 'la hoja 6 trae validación en J14');
  const c6b = cat('6', call({ action: 'catalog' }));
  const r = c6b.registros[0]; // primer bloque: J13:J54 sólo admite "AP"
  const it = r.items[1];
  const res = call({ action: 'batch', ops: [{
    id: 'op-dv1', op: 'update', sheet: '6', h: r.h, sig: r.sig,
    header: { responsables: ['ROCIO CAPDEVILA', 'JULIETA HERRERA', 'N/A'] },
    items: { [it[0]]: { criterio: c6b.crit[it[1]][3], estado: 'RZ', fecha: '2026-10-17', resp: 'RC', obs: 'Falla' } }
  }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const nr = cat('6', res).registros[0];
  assert.strictEqual(nr.items[1][5], 'RZ');
  assert.deepStrictEqual(nr.resp, ['ROCIO CAPDEVILA', 'JULIETA HERRERA', 'N/A']);
  assert.ok(sh.dv.get(`${r.h + it[0]},10`), 'la validación se restauró');
  assert.ok(sh.dv.get('8,2'), 'la validación de RESPONSABLE se restauró');
});

test('crear copiando un bloque con validaciones y marcar RZ en el nuevo', () => {
  const c6b = cat('6', call({ action: 'catalog' }));
  const first = c6b.registros[0];
  const it = first.items[0];
  const res = call({ action: 'batch', ops: [{
    id: 'op-dv2', op: 'create', sheet: '6', base: { h: first.h, sig: first.sig },
    header: { elemento: 'Copia con DV', responsables: ['JULIETA HERRERA', 'N/A'] },
    items: { [it[0]]: { criterio: c6b.crit[it[1]][3], estado: 'RZ', fecha: '2026-10-17', resp: 'JH' } }
  }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const nr = cat('6', res).registros.slice(-1)[0];
  assert.strictEqual(nr.elemento, 'Copia con DV');
  assert.strictEqual(nr.items[0][5], 'RZ');
  assert.ok(ss.getSheetByName('6').dv.get(`${nr.h + it[0]},10`), 'el bloque nuevo conserva la validación copiada');
});

test('si una escritura falla, el bloque nuevo no queda a medio crear', () => {
  const sh = ss.getSheetByName('10');
  const before = cat('10', call({ action: 'catalog' })).registros.length;
  const orig = sh.put.bind(sh);
  sh.put = (r, c, v) => { if (v === 'BOOM') throw new Error('falla simulada'); return orig(r, c, v); };
  const res = call({ action: 'batch', ops: [{ id: 'op-rb', op: 'create', sheet: '10', header: { elemento: 'BOOM' }, items: {} }] });
  sh.put = orig;
  assert.ok(!res.results[0].ok);
  assert.strictEqual(cat('10', call({ action: 'catalog' })).registros.length, before);
});

test('FOD 02: sólo la última revisión de cada código', () => {
  const { loadWorkbook: lw } = require('./fake-gas');
  const fodBook = lw(process.argv[3]);
  const FID = 'FODID0000000000000000000';
  gas = createGas(ss, { FOD02_ID: FID }, { books: { [FID]: fodBook }, files: { [FID]: { mime: 'application/vnd.google-apps.spreadsheet', name: 'FOD-02' } } });
  const c = call({ action: 'catalog' });
  const docs = c.fod.docs;
  assert.strictEqual(docs.length, 709, 'códigos distintos (S12p y S12P son el mismo)');
  const by = (code) => docs.find(d => d[0] === code);
  assert.strictEqual(by('KIR-COMR-RELEVAMIENTO')[1], '4');
  assert.strictEqual(by('KIR-COMR-IS-SAN-P03')[1], '11');
  assert.strictEqual(by('KIR-COMR-REF-ESTR-S12P')[1], '7');
  assert.strictEqual(by('KIR-COMR-REF-ESTR-S12P')[7], 'si');
  assert.ok(docs[0][5] >= docs[docs.length - 1][5], 'ordenados por fecha descendente');
  assert.ok(!c.categorias.some(x => x.sheet === 'FOD-02'));
});

test('vincular FOD 02: enlaces de SharePoint, Excel sin convertir, Excel con conversión y pestaña copiada', () => {
  const { loadWorkbook: lw } = require('./fake-gas');
  const GS = 'GSHEET00000000000000000001', XL = 'XLSX000000000000000000001';
  const extra = {
    books: { [GS]: lw(process.argv[3]) },
    files: { [GS]: { mime: 'application/vnd.google-apps.spreadsheet', name: 'FOD 02 Google' },
             [XL]: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'FOD-02 Rev. 3.xlsx', updated: 1 } }
  };
  const props = {};
  let g = createGas(ss, props, extra);
  let r = g.linkFod_('https://kirsrl.sharepoint.com/:x:/r/sites/Centrodedocumentos/Documentos/FOD-02.xlsx?d=abc');
  assert.ok(!r.ok && /SharePoint/.test(r.msg), r.msg);
  r = g.linkFod_('cualquier cosa');
  assert.ok(!r.ok && /No reconozco/.test(r.msg));
  r = g.linkFod_('https://drive.google.com/file/d/NOEXISTE0000000000000000/view');
  assert.ok(!r.ok && /No pude abrir/.test(r.msg), r.msg);
  r = g.linkFod_(`https://drive.google.com/file/d/${XL}/view?usp=sharing`);
  assert.ok(!r.ok && /sin convertir/.test(r.msg), r.msg);
  // caso reportado: planilla de Google sin permiso de Drive todavía autorizado
  extra.noDriveScope = true;
  r = g.linkFod_(`https://docs.google.com/spreadsheets/d/${GS}/edit#gid=0`);
  assert.ok(r.ok && /709/.test(r.msg), r.msg);
  assert.strictEqual(g.api({ action: 'catalog' }).fod.docs.length, 709);
  r = g.linkFod_(`https://drive.google.com/file/d/${XL}/view`);
  assert.ok(!r.ok && /autorizar/.test(r.msg), r.msg);
  extra.noDriveScope = false;
  r = g.linkFod_(`https://docs.google.com/spreadsheets/d/${GS}/edit#gid=0`);
  assert.ok(r.ok && /709/.test(r.msg), r.msg);
  assert.strictEqual(props.FOD02_ID, GS);
  // con el servicio avanzado Drive: el .xlsx se convierte solo y se reutiliza mientras no cambie
  extra.advancedDrive = () => lw(process.argv[3]);
  g = createGas(ss, props, extra);
  r = g.linkFod_(`https://drive.google.com/file/d/${XL}/view`);
  assert.ok(r.ok && /709/.test(r.msg), r.msg);
  g.api({ action: 'catalog' });
  assert.strictEqual(extra.conversions, 1, 'reutiliza la copia convertida');
  extra.files[XL].updated = 2; // subieron una versión nueva del Excel
  assert.strictEqual(g.api({ action: 'catalog' }).fod.docs.length, 709);
  assert.strictEqual(extra.conversions, 2, 'reconvierte cuando cambia el Excel');
  // pestaña copiada dentro del PIE con otro nombre
  const copia = ss.insertSheet('Copia de FOD-02');
  copia.maxRows = 2000;
  lw(process.argv[3]).getSheetByName('FOD-02').cells.forEach((v, k) => copia.cells.set(k, v));
  r = g.linkFod_('');
  assert.ok(r.ok && /Copia de FOD-02/.test(r.msg) && /709/.test(r.msg), r.msg);
  assert.strictEqual(g.api({ action: 'catalog' }).fod.docs.length, 709);
  ss.sheets.splice(ss.sheets.indexOf(copia), 1);
});

test('fotos: se guardan en Drive, se anotan en la fila y no se duplican', () => {
  const c10 = cat('10', call({ action: 'catalog' }));
  const r = c10.registros[0];
  const it = r.items[3];
  const op = { id: 'op-foto1', op: 'photo', sheet: '10', h: r.h, sig: r.sig, off: it[0], criterio: c10.crit[it[1]][3], tarea: c10.crit[it[1]][1],
    mime: 'image/jpeg', data: Buffer.from('jpegdata').toString('base64'), by: 'FC' };
  const res = call({ action: 'batch', ops: [op] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  assert.ok(/drive.google.com/.test(res.results[0].url));
  const row = r.h + it[0];
  assert.ok(ss.getSheetByName('10').notes.get(`${row},12`).includes(res.results[0].url), 'nota en OBSERVACIONES');
  const nr = cat('10', res).registros[0];
  assert.strictEqual(nr.fotos[it[0]].length, 1);
  const again = call({ action: 'batch', ops: [op] });
  assert.ok(again.results[0].dup);
  assert.strictEqual(again.results[0].url, res.results[0].url);
  assert.strictEqual(cat('10', again).registros[0].fotos[it[0]].length, 1);
  const drive = gas.__drive;
  assert.strictEqual(Object.values(drive.byId).reduce((a, f) => a + f.files.length, 0), 1);
});

test('foto de un registro creado offline (ref al alta)', () => {
  const res = call({ action: 'batch', ops: [
    { id: 'op-c9', op: 'create', sheet: '44', header: { elemento: 'Viguetas 3P' }, items: {} }
  ] });
  assert.ok(res.results[0].ok);
  const c44 = cat('44', res);
  const nr = c44.registros.slice(-1)[0];
  const it = nr.items[0];
  const res2 = call({ action: 'batch', ops: [{ id: 'op-f9', op: 'photo', sheet: '44', ref: 'op-c9', off: it[0], criterio: c44.crit[it[1]][3], data: 'AAAA' }] });
  assert.ok(res2.results[0].ok, JSON.stringify(res2.results[0]));
  assert.strictEqual(cat('44', res2).registros.slice(-1)[0].fotos[it[0]].length, 1);
});

test('instrumento: se escribe el N° de serie y no se borra al crear un bloque', () => {
  const c10 = cat('10', call({ action: 'catalog' }));
  const r = c10.registros[0];
  const it = r.items.find(x => c10.crit[x[1]][5] === 'CINTA METRICA');
  const res = call({ action: 'batch', ops: [{ id: 'op-ins1', op: 'update', sheet: '10', h: r.h, sig: r.sig,
    items: { [it[0]]: { criterio: c10.crit[it[1]][3], instrumento: 'CINTA METRICA/MEDIDOR LASER', estado: 'AP' } } }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const c10b = cat('10', res);
  const nr = c10b.registros[0];
  const ni = nr.items.find(x => x[0] === it[0]);
  assert.strictEqual(c10b.crit[ni[1]][5], 'CINTA METRICA/MEDIDOR LASER');
  // un bloque nuevo copiado conserva los instrumentos del modelo
  const res2 = call({ action: 'batch', ops: [{ id: 'op-ins2', op: 'create', sheet: '10', base: { h: r.h, sig: r.sig }, header: { elemento: 'Muro X' }, items: {} }] });
  const c10c = cat('10', res2);
  const created = c10c.registros.slice(-1)[0];
  assert.ok(created.items.every(x => c10c.crit[x[1]][5] !== ''), 'instrumentos copiados del modelo');
});

test('FOD 02: historial de revisiones con la fecha en que llegó cada una', () => {
  const { loadWorkbook: lw } = require('./fake-gas');
  const FID = 'FODID0000000000000000000';
  const g = createGas(ss, { FOD02_ID: FID }, { books: { [FID]: lw(process.argv[3]) }, files: { [FID]: { mime: 'application/vnd.google-apps.spreadsheet', name: 'FOD' } } });
  const docs = JSON.parse(JSON.stringify(g.api({ action: 'catalog' }).fod.docs));
  const d = docs.find(x => x[0] === 'KIR-COMR-REF-ESTR-S12P');
  assert.deepStrictEqual(d[10].map(h => h[0]), ['0', '1', '4', '5', '6', '7']); // la R6 figura como S12p
  assert.strictEqual(d[10].find(h => h[0] === '7')[1], '2026-10-02');
  assert.strictEqual(d[10].find(h => h[0] === '1')[1], '2026-07-14', 'la primera vez que llegó la R1');
});

test('FUM: abrir al rechazar, número correlativo, editar y cerrar', () => {
  const c13 = cat('13', call({ action: 'catalog' }));
  const r = c13.registros[2];
  const a = r.items[0], b = r.items[1];
  const res = call({ action: 'batch', ops: [
    { id: 'op-rz1', op: 'update', sheet: '13', h: r.h, sig: r.sig, items: { [a[0]]: { criterio: c13.crit[a[1]][3], estado: 'RZ', obs: 'Fisuras' } } },
    { id: 'op-fum1', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: a[0], criterio: c13.crit[a[1]][3], obs: 'Fisuras', accionCorrectiva: 'Rehacer carpeta', plazo: '2026-10-24', by: 'FC' },
    { id: 'op-fum2', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: b[0], criterio: c13.crit[b[1]][3], by: 'MP' }
  ] });
  assert.ok(res.results.every(x => x.ok), JSON.stringify(res.results));
  assert.strictEqual(res.results[1].fum, 1);
  assert.strictEqual(res.results[2].fum, 2);
  const f1 = res.fums.find(f => f[0] === 1);
  assert.deepStrictEqual([f1[1], f1[2], f1[3], f1[5], f1[6], f1[7], f1[10], f1[13]], ['13', r.h, a[0], 'Abierta', '2026-10-24', 'Rehacer carpeta', 'Fisuras', 'FC']);
  assert.strictEqual(cat('13', res).registros[2].items[0][6], '1', 'N° de FUM escrito en la columna FUM N° del PIE');
  // reintento: no duplica; abrir de nuevo el mismo control reutiliza la FUM abierta
  const again = call({ action: 'batch', ops: [{ id: 'op-fum1', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, off: a[0] }] });
  assert.ok(again.results[0].dup && again.results[0].fum === 1);
  const reuse = call({ action: 'batch', ops: [{ id: 'op-fum1b', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: a[0], criterio: c13.crit[a[1]][3] }] });
  assert.strictEqual(reuse.results[0].fum, 1);
  // editar y cerrar (cerrar por ref al alta)
  const res2 = call({ action: 'batch', ops: [
    { id: 'op-fum3', op: 'fum', accion: 'editar', num: 2, plazo: '2026-10-30', accionCorrectiva: 'Repicar' },
    { id: 'op-fum4', op: 'fum', accion: 'cerrar', ref: 'op-fum1', fecha: '2026-10-20', resultado: 'Reinspección AP', by: 'FC' },
    { id: 'op-fum5', op: 'fum', accion: 'cerrar', num: 99 }
  ] });
  assert.ok(res2.ok, JSON.stringify(res2).slice(0, 300));
  assert.ok(res2.results[0].ok && res2.results[1].ok, JSON.stringify(res2.results));
  assert.strictEqual(res2.results[2].code, 'conflict');
  const g1 = res2.fums.find(f => f[0] === 1), g2 = res2.fums.find(f => f[0] === 2);
  assert.deepStrictEqual([g1[5], g1[11], g1[12]], ['Cerrada', '2026-10-20', 'Reinspección AP']);
  assert.deepStrictEqual([g2[5], g2[6], g2[7]], ['Abierta', '2026-10-30', 'Repicar']);
  assert.ok(!call({ action: 'catalog' }).categorias.some(c => /FUM/.test(c.sheet)));
});

test('FUM de un registro creado offline (ref al alta en el mismo lote)', () => {
  const res = call({ action: 'batch', ops: [
    { id: 'op-c20', op: 'create', sheet: '43', header: { elemento: 'Planchuela P5' }, items: {} },
    { id: 'op-f20', op: 'fum', accion: 'abrir', sheet: '43', ref: 'op-c20', off: 1, by: 'FC' }
  ] });
  assert.ok(res.results.every(x => x.ok), JSON.stringify(res.results));
  assert.strictEqual(res.results[1].fum, 3);
});

test('FOG 01: la FUM se registra en el formulario de mejoras con su numeración', () => {
  if (!process.argv[4]) { console.log('   (sin fog.json, se omite)'); return; }
  const { loadWorkbook: lw } = require('./fake-gas');
  const GID = 'FOGID000000000000000000001';
  const fogBook = lw(process.argv[4]);
  const props = {};
  const g = createGas(ss, props, { books: { [GID]: fogBook }, files: {} });
  const link = g.linkFog_(`https://docs.google.com/spreadsheets/d/${GID}/edit`);
  assert.ok(link.ok, link.msg);
  assert.ok(/Última FUM cargada: N° 3/.test(link.msg) && /N° 4/.test(link.msg), link.msg);
  const fsh = fogBook.sheets[0];
  const cell = (r, c) => { const x = fsh.cell(r, c); return x ? (x.d || x.v) : ''; };
  fsh.fmt(17, 11).wrap = true; // formato de la última fila cargada
  const c6 = cat('6', JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))));
  const r = c6.registros[1];
  const it = r.items[2];
  const res = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [
    { id: 'op-fog1', op: 'fum', accion: 'abrir', sheet: '6', h: r.h, sig: r.sig, off: it[0], criterio: c6.crit[it[1]][3],
      obs: 'Faltan 5 cm', accionCorrectiva: 'Corregir encofrado', accionInmediata: 'Reparar', plazo: '2099-01-10', by: 'FC' }
  ] })));
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const num = res.results[0].fum;
  assert.ok(num >= 4, 'numeración a continuación del FOG: ' + num);
  // fila 18: primera libre debajo de la última FUM (17), con el formato de la anterior
  assert.strictEqual(cell(18, 1), num);
  assert.strictEqual(cell(18, 2), 'Comafi');
  assert.strictEqual(cell(18, 3), 'Comafi Reconquista');
  assert.strictEqual(cell(18, 6), 'Inspección Interna');
  assert.strictEqual(cell(18, 7), 'Producción');
  assert.ok(/Control PIE \(FOP 01\) rechazado – Planilla 6/.test(cell(18, 11)) && /Faltan 5 cm/.test(cell(18, 11)), cell(18, 11));
  assert.strictEqual(cell(18, 12), 'FC');
  assert.strictEqual(cell(18, 13), 'Reparar');
  assert.strictEqual(cell(18, 14), 'Corregir encofrado');
  assert.ok(Number(cell(18, 15)) > 1000, 'plazo en días');
  assert.ok(fsh.formats.get('18,11') && fsh.formats.get('18,11').copiedFrom === '17,11', 'formato copiado de la fila anterior');
  assert.strictEqual(cell(30, 6), 'Auditoría', 'la leyenda no se tocó');
  // cierre por reinspección: columnas "Cierre de la Acción Inmediata" y "Fecha"
  const res2 = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [
    { id: 'op-fog2', op: 'fum', accion: 'cerrar', num, fecha: '2026-10-20', resultado: 'Reinspección AP', by: 'MP' }
  ] })));
  assert.ok(res2.results[0].ok, JSON.stringify(res2.results[0]));
  assert.ok(/Reinspección aprobada en el PIE/.test(cell(18, 17)), cell(18, 17));
  assert.strictEqual(cell(18, 18), '2026-10-20');
  assert.strictEqual(res2.fums.find(f => f[0] === num)[5], 'Cerrada');
  // cuando la tabla llega a la leyenda, inserta una fila en vez de pisarla
  for (let k = 0; k < 12; k++) {
    const rr = g.api({ action: 'batch', ops: [{ id: 'op-fogx' + k, op: 'fum', accion: 'abrir', sheet: '6', h: r.h, sig: r.sig,
      off: r.items[3 + k][0], criterio: c6.crit[r.items[3 + k][1]][3], by: 'FC' }] });
    assert.ok(rr.results[0].ok, JSON.stringify(rr.results[0]));
  }
  assert.ok(fsh.inserted >= 1, 'se insertaron filas antes de la leyenda');
  const leg = [...fsh.cells.entries()].find(([k, v]) => v.v === 'Auditoría');
  assert.ok(Number(leg[0].split(',')[0]) > 30, 'la leyenda se corrió hacia abajo');
  // cierre manual en el FOG 01 se refleja en la app
  const lastNum = num + 12;
  const lastRow = [...fsh.cells.entries()].filter(([k, v]) => k.endsWith(',1') && v.v === lastNum)[0][0].split(',')[0];
  fsh.put(Number(lastRow), 18, new Date('2026-10-21T00:00:00'));
  const f = JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))).fums.find(x => x[0] === lastNum);
  assert.strictEqual(f[5], 'Cerrada');
  assert.ok(!JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))).categorias.some(c => /F\.U\.M/.test(c.sheet)));
});

test('v1.4 FOG 01: FUM previas al vínculo no se mezclan con FUM del FOG del mismo número', () => {
  if (!process.argv[4]) return;
  const { loadWorkbook: lw } = require('./fake-gas');
  // libro nuevo con FUM de la app SIN FOG (N° 1 y 2 en el índice)
  const book = lw(process.argv[2]);
  const g0 = createGas(book, {});
  const c13 = cat('13', JSON.parse(JSON.stringify(g0.api({ action: 'catalog' }))));
  const r = c13.registros[1];
  const mk = (id, k) => ({ id, op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: r.items[k][0], criterio: c13.crit[r.items[k][1]][3], by: 'FC' });
  const r0 = JSON.parse(JSON.stringify(g0.api({ action: 'batch', ops: [mk('p1', 0), mk('p2', 1)] })));
  assert.deepStrictEqual(r0.results.map(x => x.fum), [1, 2]);
  // ahora se vincula el FOG 01 (que tiene su propia FUM N° 1 y 2, ya cerradas)
  const GID = 'FOGID000000000000000000002';
  const fogBook = lw(process.argv[4]);
  const props = {};
  const g = createGas(book, props, { books: { [GID]: fogBook }, files: {} });
  const link = g.linkFog_(`https://docs.google.com/spreadsheets/d/${GID}/edit`);
  assert.ok(/N° 4/.test(link.msg) || /N° 3/.test(link.msg), link.msg);
  const fums = JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))).fums;
  assert.deepStrictEqual(fums.map(f => [f[0], f[5]]), [[1, 'Abierta'], [2, 'Abierta']], 'no toma el cierre de otra FUM del FOG');
  // cerrar la FUM 1 de la app no toca la fila de la FUM 1 del FOG
  const before = JSON.stringify([...fogBook.sheets[0].cells.entries()].filter(([k]) => k.startsWith('14,')));
  const rc = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [{ id: 'p3', op: 'fum', accion: 'cerrar', num: 1, resultado: 'Reinspección AP', by: 'FC' }] })));
  assert.ok(rc.results[0].ok, JSON.stringify(rc.results[0]));
  assert.strictEqual(JSON.stringify([...fogBook.sheets[0].cells.entries()].filter(([k]) => k.startsWith('14,'))), before, 'fila 14 del FOG intacta');
  // la próxima FUM sigue la numeración del FOG y del índice, y el cartel lo dice bien
  const nx = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [mk('p4', 2)] })));
  assert.strictEqual(nx.results[0].fum, 4);
});

test('v1.4 FOG 01: si el FOG no abre, la FUM se crea igual y se pasa al FOG cuando vuelve', () => {
  if (!process.argv[4]) return;
  const { loadWorkbook: lw } = require('./fake-gas');
  const book = lw(process.argv[2]);
  const GID = 'FOGID000000000000000000003';
  const extra = { books: { [GID]: lw(process.argv[4]) }, files: {} };
  const props = {};
  const g = createGas(book, props, extra);
  assert.ok(g.linkFog_(`https://docs.google.com/spreadsheets/d/${GID}/edit`).ok);
  delete extra.books[GID];   // el FOG deja de estar disponible
  const c13 = cat('13', JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))));
  const r = c13.registros[1];
  const res = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [{ id: 'q1', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: r.items[0][0], criterio: c13.crit[r.items[0][1]][3], by: 'FC' }] })));
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  assert.ok(/FOG 01/.test(res.results[0].warnings.join(' ')), 'avisa que quedó pendiente en el FOG');
  // vuelve el FOG: la próxima operación de FUM la registra
  const fogBook = lw(process.argv[4]);
  extra.books[GID] = fogBook;
  const res2 = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [{ id: 'q2', op: 'fum', accion: 'editar', num: res.results[0].fum, accionCorrectiva: 'Rehacer' }] })));
  assert.ok(res2.results[0].ok, JSON.stringify(res2.results[0]));
  const fsh = fogBook.sheets[0];
  assert.strictEqual(res.results[0].fum, 4, 'sigue la numeración del FOG aunque no abriera');
  const hit = [...fsh.cells.entries()].find(([k, v]) => k.endsWith(',1') && v.v === res.results[0].fum);
  assert.ok(hit, 'la FUM pendiente se escribió en el FOG');
  const row = Number(hit[0].split(',')[0]);
  assert.strictEqual(fsh.cell(row, 14).v, 'Rehacer');
});

test('v1.4 FOG 01: reintento después de un fallo no duplica la fila', () => {
  if (!process.argv[4]) return;
  const { loadWorkbook: lw } = require('./fake-gas');
  const book = lw(process.argv[2]);
  const GID = 'FOGID000000000000000000004';
  const fogBook = lw(process.argv[4]);
  const g = createGas(book, { FOG01_ID: GID }, { books: { [GID]: fogBook }, files: {} });
  const c13 = cat('13', JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))));
  const r = c13.registros[1];
  const op = { id: 'w1', op: 'fum', accion: 'abrir', sheet: '13', h: r.h, sig: r.sig, off: r.items[0][0], criterio: c13.crit[r.items[0][1]][3], by: 'FC' };
  // falla la escritura del log después de escribir todo lo demás
  const log = book.getSheetByName('_PIE_LOG') || book.insertSheet('_PIE_LOG');
  const orig = log.appendRow.bind(log);
  log.appendRow = () => { throw new Error('se cortó'); };
  const r1 = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [op] })));
  log.appendRow = orig;
  assert.ok(!r1.results[0].ok);
  const r2 = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [op] })));
  assert.ok(r2.results[0].ok, JSON.stringify(r2.results[0]));
  const nums = [...fogBook.sheets[0].cells.entries()].filter(([k, v]) => k.endsWith(',1') && typeof v.v === 'number' && Number(k.split(',')[0]) >= 18).map(([, v]) => v.v);
  assert.deepStrictEqual(nums, [4], 'una sola fila nueva en el FOG');
});

test('foto sin permiso de Drive: mensaje con los pasos para autorizar (error reportado)', () => {
  const g = createGas(ss, {});
  const c10 = cat('10', JSON.parse(JSON.stringify(g.api({ action: 'catalog' }))));
  const r = c10.registros[1];
  const it = r.items[0];
  g.DriveApp.getRootFolder().createFolder = () => { throw new Error('No tienes permiso para llamar a DriveApp.Folder.createFolder. Permisos necesarios: https://www.googleapis.com/auth/drive'); };
  const res = JSON.parse(JSON.stringify(g.api({ action: 'batch', ops: [{ id: 'op-noauth', op: 'photo', sheet: '10', h: r.h, sig: r.sig, off: it[0], criterio: c10.crit[it[1]][3], data: 'AAAA' }] })));
  assert.strictEqual(res.results[0].code, 'auth_drive');
  assert.ok(/autorizar/.test(res.results[0].error) && /Nueva versión/.test(res.results[0].error), res.results[0].error);
});

test('v1.4 seguridad: textos que empiezan con = se guardan como texto (inyección de fórmulas)', () => {
  const c10 = cat('10', call({ action: 'catalog' }));
  const r = c10.registros[2];
  const it = r.items[1];
  const res = call({ action: 'batch', ops: [{ id: 'op-inj', op: 'update', sheet: '10', h: r.h, sig: r.sig,
    header: { elemento: '=IMPORTXML("http://x","//a")' },
    items: { [it[0]]: { criterio: c10.crit[it[1]][3], obs: '=HYPERLINK("http://x")', fum: '+1', documento: '-A1' } } }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const sh = ss.getSheetByName('10');
  const row = r.h + it[0];
  assert.ok(!sh.cell(row, 12).f && sh.cell(row, 12).quoted && sh.cell(row, 12).v === '=HYPERLINK("http://x")', JSON.stringify(sh.cell(row, 12)));
  assert.ok(sh.cell(row, 11).quoted && sh.cell(row, 11).v === '+1');
  assert.ok(sh.cell(row, 7).quoted && sh.cell(row, 7).v === '-A1');
  const el = [...sh.cells.entries()].find(([k, v]) => typeof v.v === 'string' && v.v.includes('IMPORTXML'));
  assert.ok(el && !el[1].f && el[1].quoted, JSON.stringify(el));
  // la app lo lee sin el apóstrofo
  const nr = cat('10', res).registros[2];
  assert.strictEqual(nr.elemento, '=IMPORTXML("http://x","//a")');
  // un "-5 mm" sigue siendo texto normal
  const res2 = call({ action: 'batch', ops: [{ id: 'op-inj2', op: 'update', sheet: '10', h: r.h, sig: r.sig,
    items: { [it[0]]: { criterio: c10.crit[it[1]][3], obs: '-5 mm respecto al eje' } } }] });
  assert.strictEqual(sh.cell(row, 12).v, '-5 mm respecto al eje');
});

test('v1.4 seguridad: fotos sólo imágenes y de tamaño razonable', () => {
  const c10 = cat('10', call({ action: 'catalog' }));
  const r = c10.registros[1], it = r.items[1];
  const base = { op: 'photo', sheet: '10', h: r.h, sig: r.sig, off: it[0], criterio: c10.crit[it[1]][3] };
  const res = call({ action: 'batch', ops: [
    Object.assign({ id: 'op-bad1', mime: 'text/html', data: 'AAAA' }, base),
    Object.assign({ id: 'op-bad2', mime: 'image/jpeg', data: 'A'.repeat(15 * 1024 * 1024) }, base)
  ] });
  assert.strictEqual(res.results[0].code, 'bad_request');
  assert.strictEqual(res.results[1].code, 'bad_request');
});

test('v1.4 fotos: nombre y carpeta que permiten rastrear el control', () => {
  const c6 = cat('6', call({ action: 'catalog' }));
  const r = c6.registros[3], it = r.items[4];
  const g2 = createGas(ss, {});
  const res = JSON.parse(JSON.stringify(g2.api({ action: 'batch', ops: [
    { id: 'op-name1', op: 'photo', sheet: '6', h: r.h, sig: r.sig, off: it[0], criterio: c6.crit[it[1]][3], tarea: c6.crit[it[1]][1],
      mime: 'image/jpeg', data: 'AAAA', by: 'FC', takenAt: '2026-10-18T09:41:00' },
    { id: 'op-name2', op: 'photo', sheet: '6', h: r.h, sig: r.sig, off: it[0], criterio: c6.crit[it[1]][3], tarea: c6.crit[it[1]][1],
      mime: 'image/jpeg', data: 'AAAA', by: 'FC', takenAt: '2026-10-18T09:42:00' }
  ] })));
  assert.ok(res.results.every(x => x.ok), JSON.stringify(res.results));
  const folders = Object.values(g2.__drive.byId);
  const files = folders.flatMap(f => f.files);
  assert.strictEqual(files.length, 2);
  const n = files[0].name;
  const row = r.h + it[0];
  assert.ok(n.startsWith('PIE-6_F' + row + '_'), n);
  assert.ok(/_2026-10-18_0941_FC_01\.jpg$/.test(n), n);
  assert.ok(/_02\.jpg$/.test(files[1].name), files[1].name);
  assert.ok(n.length <= 140 && !/[\\/:*?"<>|]/.test(n), n);
  // carpeta: Fotos de control › 6 - HORMIGON… › Fila <tarea> - <elemento>
  const reg = folders.find(f => f.files.length);
  assert.ok(reg.name.startsWith('Fila ' + r.h + ' - '), reg.name);
});

test('v1.7 equipos de medición: la hoja se arma con los N° de serie de DATOS y la app recibe los vencimientos', () => {
  assert.deepStrictEqual(call({ action: 'catalog' }).equipos, [], 'sin hoja, sin equipos');
  const n = gas.crearHojaEquipos_(ss);
  const sh = ss.getSheetByName('EQUIPOS DE MEDICIÓN');
  assert.ok(sh && n >= 3, 'equipos tomados de DATOS: ' + n);
  const rows = [];
  for (let r = 2; r <= n + 1; r++) rows.push([sh.cell(r, 1).v, String(sh.cell(r, 2).v)]);
  assert.ok(rows.some(x => x[0] === 'NIVEL LASER' && x[1] === '1167'), JSON.stringify(rows));
  assert.ok(rows.some(x => x[0] === 'TELURIMETRO' && x[1] === 'TELU 117'), JSON.stringify(rows));
  assert.ok(!rows.some(x => /INDIQUE/.test(x[1])), 'sin «INDIQUE NO. SERIAL»');
  const r1167 = rows.findIndex(x => x[1] === '1167') + 2;
  sh.put(r1167, 3, '15/03/2027');
  sh.put(r1167, 4, 'https://drive.google.com/cert-1167');
  sh.appendRow(['NIVEL OPTICO', 'NO-2231', '2026-01-10', '', 'Pendiente de recalibrar']);
  const eq = call({ action: 'catalog' }).equipos;
  const e1 = eq.find(x => x.serie === '1167');
  assert.deepStrictEqual([e1.equipo, e1.vence, e1.cert], ['NIVEL LASER', '2027-03-15', 'https://drive.google.com/cert-1167']);
  const e2 = eq.find(x => x.serie === 'NO-2231');
  assert.deepStrictEqual([e2.equipo, e2.vence, e2.obs], ['NIVEL OPTICO', '2026-01-10', 'Pendiente de recalibrar']);
  assert.ok(!call({ action: 'catalog' }).categorias.some(c => c.sheet === 'EQUIPOS DE MEDICIÓN'), 'no es una planilla del PIE');
});

test('v1.7 liberación de etapa: queda en la hoja LIBERACIONES y vuelve a la app (también con ref a un alta)', () => {
  const c = cat('6', call({ action: 'catalog' }));
  const r = c.registros[0];
  const res = call({ action: 'batch', ops: [{ id: 'lib-1', op: 'liberar', sheet: '6', h: r.h, sig: r.sig, elemento: r.elemento,
    etapa: 'PRE', fecha: '2026-10-20', by: 'FC', resumen: '33 controles: 30 AP · 3 N/A', plano: 'KIR-COMR-REF-ESTR-S12P-R07', obs: '=HYPERLINK("x")' }] });
  assert.ok(res.results[0].ok, JSON.stringify(res.results[0]));
  const ls = ss.getSheetByName('LIBERACIONES');
  assert.ok(ls, 'hoja creada');
  assert.strictEqual(ls.cell(1, 9).v, 'Liberó');
  assert.deepStrictEqual([ls.cell(2, 2).v, ls.cell(2, 4).v, ls.cell(2, 8).v, ls.cell(2, 9).v, ls.cell(2, 14).v], ['6', r.h, 'PRE', 'FC', 'lib-1']);
  assert.ok(!ls.cell(2, 12).f && ls.cell(2, 12).quoted && ls.cell(2, 12).v === '=HYPERLINK("x")', 'texto, no fórmula: ' + JSON.stringify(ls.cell(2, 12)));
  assert.deepStrictEqual(res.liberaciones.slice(-1)[0].slice(0, 5), ['6', r.h, 'PRE', '2026-10-20', 'FC']);
  // reintento del mismo envío: no se duplica
  const again = call({ action: 'batch', ops: [{ id: 'lib-1', op: 'liberar', sheet: '6', h: r.h, sig: r.sig, etapa: 'PRE', by: 'FC' }] });
  assert.ok(again.results[0].dup);
  assert.strictEqual(call({ action: 'catalog' }).liberaciones.length, 1);
  // alta y liberación en el mismo lote (sin señal se encolan juntas)
  const last = c.registros[c.registros.length - 1];
  const both = call({ action: 'batch', ops: [
    { id: 'lib-c', op: 'create', sheet: '6', by: 'FC', base: { h: last.h, sig: last.sig }, header: { elemento: 'Losa L9', piso: '9P' }, items: {} },
    { id: 'lib-2', op: 'liberar', sheet: '6', ref: 'lib-c', etapa: 'PRE', fecha: '2026-10-20', by: 'FC' }] });
  assert.ok(both.results[1].ok, JSON.stringify(both.results[1]));
  assert.strictEqual(both.results[1].h, both.results[0].h);
  assert.strictEqual(ls.cell(3, 5).v, 'Losa L9');
  assert.ok(!call({ action: 'catalog' }).categorias.some(c => c.sheet === 'LIBERACIONES'), 'no es una planilla del PIE');
});

test('errores: hoja inexistente y clave', () => {
  const res = call({ action: 'batch', ops: [{ id: 'op-8', op: 'create', sheet: 'DATOS', items: {} }] });
  assert.ok(!res.results[0].ok);
  assert.strictEqual(res.results[0].code, 'not_found');
  gas = createGas(ss, { PIE_TOKEN: 'secreto' });
  assert.ok(call({ action: 'catalog', token: 'secreto' }).fod.aviso, 'sin FOD vinculado avisa');
  assert.strictEqual(call({ action: 'catalog', token: 'mala' }).code, 'auth');
  assert.strictEqual(call({ action: 'catalog', token: '' }).code, 'auth');
  // sin clave configurada la API no queda abierta
  const sinClave = createGas(ss, { PIE_TOKEN: '' });
  assert.strictEqual(JSON.parse(JSON.stringify(sinClave.api({ action: 'catalog', token: '' }))).code, 'config');
  assert.ok(call({ action: 'catalog', token: 'secreto' }).ok);
});

test('doGet sirve la app y doPost responde JSON', () => {
  const html = gas.doGet({ parameter: {} }).getContent();
  assert.ok(html.includes('window.PIE_BOOT={"mode":"webapp"'));
  const out = JSON.parse(gas.doPost({ postData: { contents: JSON.stringify({ action: 'ping', token: 'secreto' }) } }).getContent());
  assert.ok(out.ok);
});

console.log(`\n${passed} pruebas OK`);
