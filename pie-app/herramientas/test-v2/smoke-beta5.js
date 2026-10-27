// Prueba del backend de la 2.3.0-beta.5: fotos generales con nota, fecha y autor en el índice.
// Uso: PIE_VER=v2.3-beta.5 PIE_PLANOS=<carpeta planos> node smoke-beta5.js <wb.json>
const assert = require('assert');
const { loadWorkbook, createGas } = require('./fake-gas');
const gas = createGas(loadWorkbook(process.argv[2]), { PIE_TOKEN: 't' }, {});
const call = (req) => gas.api(Object.assign({ token: 't' }, req));
const c6 = call({ action: 'catalog' }).categorias.find(c => c.sheet === '6');
const r = c6.registros[c6.registros.length - 1];
const jpg = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';
const foto = (id, extra) => call({ action: 'batch', ops: [Object.assign({ id, op: 'photo', scope: 'registro', sheet: '6', h: r.h, sig: r.sig, elemento: r.elemento, mime: 'image/jpeg', data: jpg, by: 'FC', takenAt: '2026-10-21T10:15:00' }, extra)] });
let b = foto('f1', { nota: 'Armadura antes de hormigonar' });
assert(b.results[0].ok, JSON.stringify(b.results[0]));
b = foto('f2', {});
b = foto('f3', { nota: '=SUMA(1;1) ' + 'x'.repeat(300) });
assert(b.results.every(x => x.ok));
const fotos = call({ action: 'catalog' }).categorias.find(c => c.sheet === '6').registros.find(x => x.h === r.h).fotos[0];
assert.strictEqual(fotos.length, 3, 'tres fotos en el índice');
assert.strictEqual(JSON.stringify(fotos[0].slice(2)), JSON.stringify(['2026-10-21', 'FC', 'Armadura antes de hormigonar']), 'fecha, inspector y nota');
assert.strictEqual(fotos[1][4], '', 'sin nota queda vacía');
assert(fotos[2][4].length <= 201 && !/^=/.test(fotos[2][4]), 'la nota se acota y no puede ser fórmula: ' + fotos[2][4].slice(0, 20));
console.log('OK · beta.5: fotos con nota, fecha y autor; nota acotada y sin fórmulas');
