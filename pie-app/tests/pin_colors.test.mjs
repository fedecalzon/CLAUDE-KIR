import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const legacyHeader = ['pin_id', 'fecha', 'planilla', 'fila_tarea', 'elemento', 'piso', 'plano', 'x', 'y', 'puso', 'estado', 'op_id', 'alcance', 'alc', 'puntos'];
const colors = ['auto', 'azul', 'violeta', 'naranja', 'turquesa', 'rosa'];
const plain = value => JSON.parse(JSON.stringify(value));
const pin = (overrides = {}) => Object.assign(['pin-1', '2026-10-21', '6', 9, 'Banquina', 'SS4', 'plano-1', .2, .3, 'TEST', 'activo', 'op-original', 'tarea', 'PRE|Replanteo', ''], overrides);

function fakeSheet(rows) {
  const grid = rows.map(row => row.slice());
  const writes = [];
  let columns = Math.max(26, ...grid.map(row => row.length));
  const sh = {
    grid, writes,
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(0, ...grid.map(row => row.length)),
    getMaxColumns: () => columns,
    insertColumnsAfter: (after, count) => { columns += count; return sh; },
    setFrozenRows: () => sh,
    hideSheet: () => sh,
    appendRow: row => { grid.push(Array.from(row)); writes.push({append: true, row: grid.length}); return sh; },
    getRange: (row, col = 1, height = 1, width = 1) => {
      if (row === 'A:A') return {createTextFinder: id => ({matchEntireCell: () => ({findNext: () => {
        const i = grid.findIndex(row => row[0] === id);
        return i < 0 ? null : {getRow: () => i + 1};
      }})})};
      const range = {
        getValues: () => Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => grid[row + r - 1]?.[col + c - 1] ?? '')),
        setValues: values => {
          writes.push({row, col, height, width});
          for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
            grid[row + r - 1] ||= [];
            grid[row + r - 1][col + c - 1] = values[r][c];
          }
          return range;
        },
        setValue: value => range.setValues([[value]]),
        setFontWeight: () => range
      };
      return range;
    }
  };
  return sh;
}

function fixture(rows = [legacyHeader.concat('color'), pin({15: 'azul'})]) {
  const c = vm.createContext({console});
  for (const file of ['Code.gs', 'Beta.gs']) vm.runInContext(fs.readFileSync(new URL('../apps-script/' + file, import.meta.url), 'utf8'), c);
  c.Session = {getScriptTimeZone: () => 'America/Argentina/Buenos_Aires'};
  c.Utilities = {formatDate: () => '2026-10-21'};
  const sh = fakeSheet(rows);
  const ss = {getSheetByName: () => sh, insertSheet: () => sh};
  c.readPlanos_ = () => [{id: 'plano-1', planilla: '6'}];
  c.sheetOrThrow_ = () => ({});
  c.resolveBlock_ = () => ({blk: {tareaRow: 9, header: {elemento: 'Banquina', piso: 'SS4'}}});
  return {c, sh, ss};
}
const colorOp = color => ({id: 'color-op-1', op: 'pin', accion: 'color', pin: 'pin-1', sheet: '6', color, by: 'TEST'});
const putOp = color => ({id: 'put-op-1', op: 'pin', accion: 'poner', pin: 'pin-new', sheet: '6', plano: 'plano-1', h: 9, color, x: .1, y: .2, by: 'TEST'});

test('colores: paleta cerrada y clientes anteriores usan automático', () => {
  const {c} = fixture();
  for (const value of colors) assert.equal(c.pinColor_(value), value);
  for (const value of [undefined, null, '']) assert.equal(c.pinColor_(value), 'auto');
  for (const value of ['verde', '#fff', 'url(javascript:1)', {}, [], false, 2]) {
    assert.throws(() => c.pinColor_(value), error => error.code === 'bad_request', `Rechazar ${JSON.stringify(value)}`);
  }
});

test('lectura: conserva posiciones y alcance e incluye color; filas históricas siguen legibles', () => {
  const {c, ss} = fixture([legacyHeader.concat('color'), pin({15: 'rosa'}), pin({0: 'historico'}), pin({0: 'quitado', 10: 'quitado'})]);
  const result = plain(c.readPines_(ss));
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], ['pin-1', '6', 9, 'plano-1', .2, .3, 'Banquina', 'SS4', 'TEST', 'tarea', 'PRE|Replanteo', null, 'rosa']);
  assert.equal(result[1][12], 'auto');
});

test('color: actualiza únicamente columna color sin cambiar geometría ni estado, y repetir es idempotente', () => {
  const {c, ss, sh} = fixture();
  const before = sh.grid[1].slice(0, 15);
  const result = plain(c.opPin_(ss, {}, colorOp('violeta')));
  assert.deepEqual(result, {h: 9, noTouch: true});
  assert.deepEqual(sh.grid[1].slice(0, 15), before);
  assert.equal(sh.grid[1][15], 'violeta');
  assert.ok(sh.writes.every(w => w.row === 2 && w.col === 16 && w.width === 1));
  c.opPin_(ss, {}, colorOp('violeta'));
  assert.equal(sh.grid.length, 2);
  assert.deepEqual(sh.grid[1].slice(0, 15), before);
  c.opPin_(ss, {}, colorOp('auto'));
  assert.equal(sh.grid[1][15], 'auto');
});

for (const [name, mutate] of [
  ['otra planilla', (sh, op) => {op.sheet = '7';}],
  ['pin quitado', (sh, op) => {sh.grid[1][10] = 'quitado';}],
  ['pin inexistente', (sh, op) => {op.pin = 'missing';}]
]) test('color: rechaza ' + name + ' sin escribir', () => {
  const {c, ss, sh} = fixture();
  const op = colorOp('rosa');
  mutate(sh, op);
  assert.throws(() => c.opPin_(ss, {}, op), e => e.code === 'conflict');
  assert.deepEqual(sh.writes, []);
});

test('color inválido no escribe y alta inválida no agrega filas', () => {
  const {c, ss, sh} = fixture();
  assert.throws(() => c.opPin_(ss, {}, colorOp('<script>')), e => e.code === 'bad_request');
  assert.deepEqual(sh.writes, []);
  assert.throws(() => c.opPin_(ss, {}, putOp('rojo-libre')), e => e.code === 'bad_request');
  assert.equal(sh.grid.length, 2);
  assert.deepEqual(sh.writes, []);
});

test('alta: persiste el color elegido y admite clientes anteriores', () => {
  const {c, ss, sh} = fixture();
  c.opPin_(ss, {}, putOp('turquesa'));
  assert.equal(sh.grid[2].length, 16);
  assert.equal(sh.grid[2][15], 'turquesa');
  assert.deepEqual(sh.grid[2].slice(6, 9), ['plano-1', .1, .2]);
  assert.equal(sh.grid[2][10], 'activo');
  c.opPin_(ss, {}, {...putOp(undefined), pin: 'legacy-client', id: 'legacy-op'});
  assert.equal(sh.grid[3][15], 'auto');
});

test('mover pin o zona mantiene el color manual', () => {
  const {c, ss, sh} = fixture();
  c.opPin_(ss, {}, {id:'move-1',accion:'mover',pin:'pin-1',sheet:'6',x:.4,y:.5});
  assert.equal(sh.grid[1][15], 'azul');
  assert.deepEqual(sh.grid[1].slice(7,9), [.4,.5]);
  sh.grid[1][14] = JSON.stringify([[.1,.1],[.3,.1],[.2,.3]]);
  const points = [[.2,.2],[.4,.2],[.3,.4]];
  c.opPin_(ss, {}, {id:'move-2',accion:'mover',pin:'pin-1',sheet:'6',x:.3,y:.26667,pts:points});
  assert.equal(sh.grid[1][15], 'azul');
  assert.deepEqual(JSON.parse(sh.grid[1][14]), points);
});

test('migración: agrega encabezados de color sin tocar filas existentes; segunda apertura no vuelve a escribir', () => {
  const {c, ss, sh} = fixture([legacyHeader.slice(), pin()]);
  const before = sh.grid[1].slice();
  c.pinesSheet_(ss);
  assert.equal(sh.grid[0][15], 'color');
  assert.deepEqual(sh.grid[1], before);
  assert.ok(sh.writes.every(w => w.row === 1));
  const writes = sh.writes.length;
  c.pinesSheet_(ss);
  assert.equal(sh.writes.length, writes);
});
