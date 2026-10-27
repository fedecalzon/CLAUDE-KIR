import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const c = vm.createContext({ console });
  for (const file of ['Code.gs', 'Beta.gs']) {
    vm.runInContext(fs.readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8'), c);
  }
  c.Utilities = {formatDate: () => '2026-10-20'};
  c.Session = {getScriptTimeZone: () => 'America/Argentina/Buenos_Aires'};
  c.readFums_ = () => [];
  c.readEquipos_ = () => [];
  c.readFodSafe_ = () => ({docs: []});
  c.readLiberaciones_ = () => [];
  c.block = {tareaRow: 9, items: [{off: 1, etapa: 'PRE', estado: 'AP', fecha: '2026-10-19', resp: 'FC'}]};
  c.op = {id: 'release-1', sheet: '6', etapa: 'PRE', by: 'FC'};
  return c;
}
const blocked = c => assert.throws(() => c.betaCheckRelease_({}, c.block, c.op), e => e.code === 'release_blocked');

test('liberación: acepta AP y construye el resumen desde los datos persistidos', () => {
  const c = fixture();
  c.op.resumen = '999 controles';
  assert.equal(c.betaCheckRelease_({}, c.block, c.op).resumen, '1 controles: 1 AP · 0 N/A');
});
for (const [label, mutate] of [
  ['etapa inexistente', c => c.op.etapa = 'POST'],
  ['actor vacío', c => c.op.by = ''],
  ['pendiente', c => c.block.items[0].estado = ''],
  ['rechazado', c => c.block.items[0].estado = 'RZ'],
  ['estado desconocido', c => c.block.items[0].estado = 'VERDE'],
  ['fecha inexistente', c => c.block.items[0].fecha = '2026-02-30'],
  ['fecha futura', c => c.block.items[0].fecha = '2026-10-21'],
  ['sin fecha', c => c.block.items[0].fecha = ''],
  ['sin responsable del control', c => c.block.items[0].resp = ''],
  ['serie pendiente', c => c.block.items[0].instrumento = 'NIVEL (INDIQUE SERIAL)'],
  ['serie desconocida', c => c.block.items[0].instrumento = 'NIVEL (123)'],
  ['FUM abierta aunque esté AP', c => c.readFums_ = () => [[1, '6', 9, 1, '', 'Abierta']]],
  ['equipo sin vencimiento cargado', c => { c.block.items[0].instrumento = 'NIVEL (123)'; c.readEquipos_ = () => [{equipo: 'NIVEL', serie: '123', vence: ''}]; }],
  ['misma serie en dos equipos distintos', c => { c.block.items[0].instrumento = 'NIVEL (123)'; c.readEquipos_ = () => [{equipo: 'NIVEL', serie: '123', vence: '2027-01-01'}, {equipo: 'TELURIMETRO', serie: '123', vence: '2027-01-01'}]; }],
  ['AP con fecha que no es fecha («4/12/202»)', c => c.block.items[0].fecha = '4/12/202'],
]) {
  test('liberación: bloquea ' + label, () => { const c = fixture(); mutate(c); blocked(c); });
}
test('liberación: admite N/A histórico y explícito, sin omitir FUM abiertas', () => {
  const c = fixture();
  c.block.items[0] = {off: 1, etapa: 'PRE', estado: 'N/A'};
  assert.match(c.betaCheckRelease_({}, c.block, c.op).resumen, /0 AP · 1 N\/A/);
  c.block.items[0] = {off: 1, etapa: 'PRE', estado: '', fecha: 'NA'};
  assert.match(c.betaCheckRelease_({}, c.block, c.op).resumen, /1 N\/A/);
  c.readFums_ = () => [[1, '6', 9, 1, '', 'Abierta']];
  blocked(c);
});
test('liberación: verifica calibración a la fecha del control y permite el día del vencimiento', () => {
  const c = fixture(); c.block.items[0].instrumento = 'NIVEL (123)';
  for (const vence of ['', '2026-02-30', '2026-10-18']) {
    c.readEquipos_ = () => [{serie: '123', vence}]; blocked(c);
  }
  c.readEquipos_ = () => [{serie: '123', vence: '2026-10-19'}];
  c.betaCheckRelease_({}, c.block, c.op);
  // recalibrado: otra fila con la misma serie y el mismo equipo → vale el vencimiento más lejano
  c.block.items[0].fecha = '2026-10-20';
  c.readEquipos_ = () => [{equipo: 'NIVEL', serie: '123', vence: '2026-10-19'}, {equipo: 'NIVEL', serie: '123', vence: '2027-01-01'}];
  c.betaCheckRelease_({}, c.block, c.op);
});
test('liberación: una FUM indicada que no figura en el índice no bloquea, queda como aviso; «NA» en FUM se ignora', () => {
  const c = fixture(); c.block.items[0].fum = '123';
  assert.match(c.betaCheckRelease_({}, c.block, c.op).avisos.join(), /FUM 123 no figura/);
  c.block.items[0].fum = 'NA';
  assert.equal(JSON.stringify(c.betaCheckRelease_({}, c.block, c.op).avisos), '[]');
});
test('liberación: FUM cerrada no bloquea AP', () => {
  const c = fixture(); c.block.items[0].fum = '1';
  c.readFums_ = () => [[1, '6', 9, 1, '', 'Cerrada']];
  c.betaCheckRelease_({}, c.block, c.op);
});
test('liberación: cruza documentos y revisión contra FOD, sin confiar en el plano del request', () => {
  const c = fixture(); c.block.items[0].documento = '1281-C-PL-1202-R02';
  c.readFodSafe_ = () => ({docs: [['1281-C-PL-1202', '02', '', '', '', '', '', 'Sí']]});
  c.betaCheckRelease_({}, c.block, c.op);
  // revisión superada: bloquea
  c.block.items[0].documento = '1281-C-PL-1202-R01'; blocked(c);
  // no verificable (más nueva que el FOD, sin revisión, fuera del FOD o FOD caído): aviso anotado, no bloquea
  const avisos = () => c.betaCheckRelease_({}, c.block, c.op).avisos.join(' | ');
  c.block.items[0].documento = '1281-C-PL-1202-R03'; assert.match(avisos(), /más nueva/);
  c.block.items[0].documento = '1281-C-PL-1202'; assert.match(avisos(), /sin revisión indicada/);
  c.block.items[0].documento = 'OTRO-PLANO-R02'; assert.match(avisos(), /no figura en el FOD 02/);
  c.readFodSafe_ = () => ({docs: [], aviso: 'No se pudo leer'}); assert.match(avisos(), /no se pudo consultar/);
});
test('liberación: formatos reales del FOD 02 (rev «-» o «S/N», código que ya trae la revisión, código que termina en R…)', () => {
  const c = fixture();
  c.readFodSafe_ = () => ({docs: [['319-PL-PUE', '-'], ['319-AR-Plantas-13', 'S/N'], ['CR-P-GEN-03-R01', '1'], ['KIR-COMR-RELEVAMIENTO', '4']]});
  for (const d of ['319-PL-PUE-R-', '319-PL-PUE', '319-AR-Plantas-13-RS/N', 'CR-P-GEN-03-R01', 'KIR-COMR-RELEVAMIENTO-R04']) {
    c.block.items[0].documento = d;
    assert.equal(JSON.stringify(c.betaCheckRelease_({}, c.block, c.op).avisos), '[]', d);
  }
  c.block.items[0].documento = 'KIR-COMR-RELEVAMIENTO-R03'; blocked(c);
});
test('liberación: bloquea documento no vigente aunque coincida su revisión', () => {
  const c = fixture(); c.block.items[0].documento = '1281-C-PL-1202-R02';
  c.readFodSafe_ = () => ({docs: [['1281-C-PL-1202', '02', '', '', '', '', '', 'No']]}); blocked(c);
});
test('liberación: bloquea No aprobado aun si Vigente dice Sí', () => {
  const c = fixture(); c.block.items[0].documento = 'PLANO-TEST-R02';
  c.readFodSafe_ = () => ({docs: [['PLANO-TEST', '02', '', '', '', '', 'No aprobado', 'Sí']]}); blocked(c);
});
test('liberación: no confunde códigos con y sin guion bajo del FOD real', () => {
  const c = fixture(); c.block.items[0].documento = '_KIR-COMR-REF-VyL-S11P-R05';
  c.readFodSafe_ = () => ({docs: [['_KIR-COMR-REF-VyL-S11P','5'],['KIR-COMR-REF-VyL-S11P','4']]});
  assert.equal(JSON.stringify(c.betaCheckRelease_({}, c.block, c.op).avisos), '[]', 'el código exacto con guion bajo es el de rev 5');
  c.block.items[0].documento = 'KIR-COMR-REF-VyL-S11P-R03'; blocked(c);   // el de rev 4, controlado con R03
  c.block.items[0].documento = 'KIR-COMR-REF-VyL-S11P-R04';
  assert.equal(JSON.stringify(c.betaCheckRelease_({}, c.block, c.op).avisos), '[]', 'sin guion bajo es el de rev 4');
});
test('opLiberar aplica la regla antes de crear/escribir la hoja y usa fecha del servidor', () => {
  const c = fixture(); let rows = [], calls = 0;
  c.sheetOrThrow_ = () => ({});
  c.resolveBlock_ = () => ({blk: c.block});
  c.libSheet_ = () => { calls++; return {appendRow: r => rows.push(r)}; };
  c.block.items[0].estado = 'RZ';
  assert.throws(() => c.opLiberar_({}, {}, c.op), e => e.code === 'release_blocked');
  assert.equal(calls, 0);
  c.block.items[0].estado = 'AP'; c.op.fecha = '2001-01-01';   // anterior a los controles: vale la del servidor
  c.opLiberar_({}, {}, c.op);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0].getFullYear(), 2026);
  assert.equal(rows[0][0].getDate(), 20);
  assert.equal(rows[0][9], '1 controles: 1 AP · 0 N/A');
  // liberada sin señal el 19 y enviada el 20: queda la fecha de la decisión
  c.op.fecha = '2026-10-19'; c.op.id = 'release-2';
  c.opLiberar_({}, {}, c.op);
  assert.equal(rows[1][0].getDate(), 19);
  // fecha adelantada: vale la del servidor
  c.op.fecha = '2026-10-25'; c.op.id = 'release-3';
  c.opLiberar_({}, {}, c.op);
  assert.equal(rows[2][0].getDate(), 20);
  // ya liberada: no se duplica la fila
  c.readLiberaciones_ = () => [['6', 9, 'PRE', '2026-10-19', 'FC', '']];
  c.op.id = 'release-4';
  assert.match(c.opLiberar_({}, {}, c.op).warnings[0], /ya estaba liberada/);
  assert.equal(rows.length, 3);
});
test('zonas: acepta polígonos cóncavos, ambos sentidos y pin sin zona', () => {
  const c = fixture();
  const pts = [[0, 0], [1, 0], [1, 1], [.5, .5], [0, 1]];
  assert.equal(c.zonaPts_(pts).length, 5);
  assert.equal(c.zonaPts_(pts.slice().reverse()).length, 5);
  assert.equal(c.zonaPts_(null), null);
});
for (const [label, pts] of [
  ['cruce', [[0,0],[1,1],[0,1],[1,0]]],
  ['colineal', [[0,0],[.5,.5],[1,1]]],
  ['repetido', [[0,0],[1,0],[1,1],[0,0],[0,1]]],
  ['retroceso', [[0,0],[1,0],[.5,0],[.5,1],[0,1]]],
  ['borde tocado', [[0,0],[1,0],[1,1],[.5,0],[0,1]]],
  ['fuera de imagen', [[0,0],[2,0],[1,1]]],
  ['vacío', [[0,0],['',1],[1,0]]],
  ['booleano', [[0,0],[true,1],[1,0]]],
  ['más de 80 vértices', Array.from({length:81}, (_,i)=>[i/81, i/81])],
]) {
  test('zonas: rechaza ' + label, () => { const c = fixture(); assert.throws(() => c.zonaPts_(pts), e => e.code === 'bad_request'); });
}
test('zonas: un doble toque (vértice repetido seguido, o el último igual al primero) se junta', () => {
  const c = fixture();
  assert.equal(c.zonaPts_([[.1,.1],[.2,.1],[.2,.1],[.2,.2]]).length, 3);
  assert.equal(c.zonaPts_([[0,0],[1,0],[1,1],[0,0]]).length, 3);
  assert.throws(() => c.zonaPts_([[0,0],[0,0],[1,1],[1,1]]), e => e.code === 'bad_request');
});
test('coordenadas: redondea y rechaza coerciones sin posición', () => {
  const c = fixture(); assert.equal(c.pinCoord_('0.123456'), .12346);
  for (const v of [null, undefined, '', ' ', false, [], {}, NaN, Infinity, -1, 1.01]) {
    assert.throws(() => c.pinCoord_(v), e => e.code === 'bad_request');
  }
});
test('lotes: rechaza formato inválido y más de 25 antes de tomar el lock', () => {
  const c = fixture();
  c.betaBatch_(Array.from({length:25}, (_,i)=>({id:'op-'+i})));
  // más de 25 (una app vieja): no se rechaza el lote; batch_ procesa 25 y devuelve «retry» al resto
  c.betaBatch_(Array.from({length:26}, (_,i)=>({id:'op-'+i})));
  for (const v of [{}, null, [null], [{id:'=HYPERLINK(1)'}]]) {
    assert.throws(() => c.batch_({}, v), e => e.code === 'bad_request');
  }
});
test('GET no admite escrituras', () => {
  const c = fixture(); c.json_ = x => x;
  const res = c.doGet({parameter:{action:'batch'}});
  assert.equal(res.ok, false); assert.equal(res.code, 'bad_request');
});
test('pines: no permite mover/retirar un pin de otra planilla ni reactivar uno quitado', () => {
  const c = fixture();
  c.pinRow_ = () => 2;
  const row = ['pin1', '', '6', 9, '', '', 'plano1', .2, .2, '', 'activo', '', 'reg', '', ''];
  c.pinesSheet_ = () => ({getRange:()=>({getValues:()=>[row]})});
  for (const [sheet, estado] of [['7','activo'],['6','quitado']]) {
    row[10] = estado;
    assert.throws(() => c.opPin_({}, {}, {accion:'mover',pin:'pin1',sheet,x:.5,y:.5}), e=>e.code==='conflict');
  }
});
test('pines: mover una zona necesita sus vértices', () => {
  const c = fixture(); c.pinRow_ = () => 2;
  c.pinesSheet_ = () => ({getRange:()=>({getValues:()=>[['pin1','','6',9,'','','plano1',.2,.2,'','activo','','reg','', '[[0,0],[1,0],[0,1]]']]})});
  assert.throws(() => c.opPin_({}, {}, {accion:'mover',pin:'pin1',sheet:'6',x:.5,y:.5}), e=>e.code==='bad_request');
});
test('pines: crear requiere que el plano pertenezca a la planilla', () => {
  const c = fixture(); c.pinesSheet_ = () => ({}); c.readPlanos_ = () => [{id:'plano1',planilla:'7'}];
  assert.throws(() => c.opPin_({}, {}, {accion:'poner',sheet:'6',plano:'plano1',x:.5,y:.5}), e=>e.code==='conflict');
});

test('manifiesto: entrega los códigos documentales y hojas sin cambiar IDs ni la revisión del cajetín', () => {
  const c = fixture();
  const plans = JSON.parse(fs.readFileSync(new URL('../planos/planos.json', import.meta.url), 'utf8'));
  c.planosFolderIfAny_ = () => ({getFilesByName: () => {
    let done = false;
    return {hasNext: () => !done, next: () => {done = true; return {getBlob: () => ({getDataAsString: () => JSON.stringify(plans)})};}};
  }});
  const parsed = JSON.parse(JSON.stringify(c.readPlanos_()));
  // 7 láminas de estructura en la planilla 6 + 5 de replanteo de tabiquería que sirven a 6 planillas cada una
  assert.equal(parsed.length, 7 + 5 * 6);
  assert.equal(parsed.filter(p => p.id === 'KIR-COMR-Rep.Tab_P06').map(p => p.planilla).join(), '11,15,17,20,25,38');
  assert.equal(parsed.filter(p => p.documentos.includes('_KIR-COMR-REF-ESTR-SP-R00')).length, 3);
  const beam = parsed.find(p => p.id === '1281-C-PL-1232');
  assert.deepEqual(beam.documentos, ['_KIR-COMR-REF-VyL-S11P-R04']);
  assert.equal(beam.rev, 'R02');
  assert.equal(beam.hoja, '05 de 07');
  assert.equal(new Set(parsed.map(p=>p.id)).size, 12);
});

test('manifiesto anterior: conserva compatibilidad y descarta aliases de tipo inválido', () => {
  const c = fixture();
  const plans = [{id:'plano-anterior',planilla:'6',w:100,h:100}, {id:'plano-nuevo',planilla:'6',w:100,h:100,documentos:[null,{},'  DOC-R00  ','']}];
  c.planosFolderIfAny_ = () => ({getFilesByName: () => {
    let done = false;
    return {hasNext: () => !done, next: () => {done = true; return {getBlob: () => ({getDataAsString: () => JSON.stringify(plans)})};}};
  }});
  const parsed = JSON.parse(JSON.stringify(c.readPlanos_()));
  assert.deepEqual(parsed[0].documentos, []);
  assert.deepEqual(parsed[1].documentos, ['DOC-R00']);
});
