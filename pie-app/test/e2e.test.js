// Prueba de punta a punta de la PWA en un celular emulado (requiere test/server.js corriendo).
// Uso: node test/e2e.test.js <carpeta-capturas>
const { chromium, devices } = require('playwright');
const assert = require('assert');

const APP = 'http://localhost:8080/';
const API = 'http://localhost:8081/exec';
const shots = process.argv[2] || '.';
const sheetRows = (name, from, to, book) => fetch(`http://localhost:8081/__sheet?name=${encodeURIComponent(name)}&from=${from}&to=${to}&book=${book || ''}`).then(r => r.json());

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: false });

  // 1. Configuración por enlace + descarga del catálogo
  await page.goto(`${APP}?api=${encodeURIComponent(API)}&token=clave-prueba`);
  await page.waitForSelector('text=MARIA DEL PILAR LOPEZ', { timeout: 20000 });
  await shot('01-quien');
  await page.click('text=FEDERICO CALZON');
  await page.waitForSelector('text=HORMIGON ARMADO');
  await shot('02-inicio');

  // 2. Categoría 6: registros y requisitos
  await page.click('.row:has-text("HORMIGON ARMADO")');
  await page.waitForSelector('text=Bajo recorrido');
  await shot('03-registros');
  await page.click('button[data-tab=req]');
  await page.waitForSelector('text=Replanteo Preliminar');
  await shot('04-requisitos');
  await page.click('button[data-tab=reg]');

  // esperar a que el service worker controle la página para poder abrir offline
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForSelector('text=Bajo recorrido');

  // 3. Sin señal: crear registro nuevo
  await ctx.setOffline(true);
  await page.click('.fab');
  await page.fill('input[name=elemento]', 'Losa prueba offline L1');
  await page.fill('input[name=piso]', '5P');
  await page.fill('input[name=sector]', 'Núcleo A');
  await page.fill('input[name=etapa]', '1');
  // documento desde el FOD 02 (sólo última revisión)
  await page.click('button[data-act=docpick][data-target=new]');
  await page.waitForSelector('#modal .doc');
  await page.fill('#modal input[data-input=docq]', 'REF-ESTR-S12');
  await page.waitForSelector('#modal .doc:has-text("Rev 7")');
  assert.strictEqual(await page.$$eval('#modal [data-act=pickdoc]', n => n.length), 1, 'un solo resultado por código');
  await shot('05a-fod02');
  await page.click('#modal [data-act=pickdoc]');
  assert.strictEqual(await page.inputValue('input[name=documento]'), 'KIR-COMR-REF-ESTR-S12P-R07');
  await page.fill('input[name=documento]', 'KIR-COMR-EST-P05-R00');
  await shot('05-nuevo');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Nuevo · se crea en la planilla al sincronizar');
  await page.waitForSelector('.net:has-text("Offline")');

  // 4. Cerrar y reabrir la app sin señal (sale del service worker + IndexedDB)
  await page.reload();
  await page.waitForSelector('text=Losa prueba offline L1');
  const items = await page.$$('.item');
  assert.ok(items.length > 20, 'checklist cargado offline: ' + items.length);
  // marcar: primer ítem AP, segundo RZ con FUM y observación, tercero N/A
  await page.click('.item >> nth=0 >> button[data-st=ap]');
  await page.click('.item >> nth=1 >> button[data-st=rz]');
  // RZ abre una FUM (se numera al sincronizar)
  await page.waitForSelector('.item >> nth=1 >> .fumbox:has-text("se numera al sincronizar")');
  await page.fill('.item >> nth=1 >> [data-fum=accionCorrectiva]', 'Rehacer recubrimiento');
  await page.locator('.item >> nth=1 >> [data-fum=accionCorrectiva]').blur();
  await page.fill('.item >> nth=1 >> [data-fum=plazo]', '2026-10-24');
  await page.locator('.item >> nth=1 >> [data-fum=plazo]').blur();
  await page.fill('.item >> nth=1 >> [data-field=obs]', 'Recubrimiento insuficiente');
  await page.locator('.item >> nth=1 >> [data-field=obs]').blur();
  await page.click('.item >> nth=1 >> button:has-text("Listo")');
  await page.click('.item >> nth=2 >> button[data-st=na]');
  // foto de control sin señal (queda en el celular)
  await page.click('.item >> nth=2 >> button[data-act=more]');
  await page.setInputFiles('.item >> nth=2 >> input[data-photo][multiple]', { name: 'control.png', mimeType: 'image/png', buffer: require('fs').readFileSync(__dirname + '/../app/icon-192.png') });
  await page.waitForSelector('.item >> nth=2 >> .thumbs .t img');
  await page.click('.item >> nth=2 >> button:has-text("Listo")');
  await shot('06-checklist-offline');
  const pending = await page.textContent('.net');
  assert.ok(/Offline · \d+ sin enviar/.test(pending), pending);

  // 5. Vuelve la señal: sincroniza solo y redirige al registro real
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('.net:has-text("Al día")', { timeout: 20000 });
  await page.waitForSelector('text=/Planilla 6 · fila \\d+/');
  await shot('07-sincronizado');
  const T = Number(/fila (\d+)/.exec(await page.textContent('#hdr'))[1]);
  const rows = await sheetRows('6', T - 5, T + 4);
  assert.strictEqual(rows.rows[0][1], 'RESPONSABLE');
  assert.strictEqual(rows.rows[1][3], '5P');
  assert.strictEqual(rows.rows[1][6], 'Losa prueba offline L1');
  assert.strictEqual(rows.rows[2][3], 'Núcleo A');
  assert.strictEqual(rows.rows[5][1], 'TAREA');
  assert.deepStrictEqual(rows.rows[6].slice(6, 10).map(String).slice(0, 1), ['KIR-COMR-EST-P05-R00']);
  assert.strictEqual(rows.rows[6][8], 'FC');
  assert.strictEqual(rows.rows[6][9], 'AP');
  assert.strictEqual(rows.rows[7][9], 'RZ');
  assert.strictEqual(String(rows.rows[7][10]), '4', 'N° de FUM (sigue la numeración del FOG 01) en la columna FUM N°');
  const fumRows = await sheetRows('_PIE_FUM', 1, 2);
  assert.deepStrictEqual([fumRows.rows[1][0], fumRows.rows[1][2], fumRows.rows[1][11], fumRows.rows[1][12], fumRows.rows[1][14]],
    [4, '6', 'Rehacer recubrimiento', '2026-10-24', 'Abierta']);
  const fog = await sheetRows('', 18, 18, 'fog');
  assert.deepStrictEqual([fog.rows[0][0], fog.rows[0][5], fog.rows[0][12], fog.rows[0][13]], [4, 'Inspección Interna', 'Reparar', 'Rehacer recubrimiento']);
  assert.ok(/Recubrimiento insuficiente/.test(fog.rows[0][10]), fog.rows[0][10]);
  await page.waitForSelector('.item >> nth=1 >> text=FUM 4 abierta');
  assert.strictEqual(rows.rows[7][11], 'Recubrimiento insuficiente');
  assert.strictEqual(rows.rows[8][7], 'NA');
  await page.waitForFunction(() => !document.querySelector('.thumbs .t i'), null, { timeout: 20000 }).catch(() => {});
  const withNote = await sheetRows('6', T + 3, T + 3);
  assert.ok(Object.values(withNote.notes).some(n => /Foto .*drive\.google\.com/.test(n)), 'foto subida y anotada: ' + JSON.stringify(withNote.notes));
  assert.strictEqual(withNote.files, 1);

  // 6. Editar un registro ya sincronizado (online): instrumento con N° de serie que se recuerda
  await page.click('.item >> nth=3 >> button[data-act=more]');
  await page.selectOption('.item >> nth=3 >> select[data-field=instrumento]', 'NIVEL LASER (1167)/CINTA METRICA');
  await page.click('.item >> nth=3 >> button:has-text("Listo")');
  await page.click('.item >> nth=3 >> button[data-st=ap]');
  await page.click('.item >> nth=4 >> button[data-st=ap]');
  await page.waitForSelector('.item >> nth=4 >> text=NIVEL LASER (1167)/CINTA METRICA');
  await page.waitForSelector('.net:has-text("Al día")', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día') && !document.getElementById('hdr').textContent.includes('cambios sin enviar'), null, { timeout: 20000 });
  const rows2 = await sheetRows('6', T + 4, T + 5);
  assert.strictEqual(rows2.rows[0][9], 'AP');
  assert.strictEqual(rows2.rows[0][5], 'NIVEL LASER (1167)/CINTA METRICA');
  assert.strictEqual(rows2.rows[1][5], 'NIVEL LASER (1167)/CINTA METRICA', 'instrumento recordado');

  // 6b. Plano único del registro: se cambia una vez y se aplica a los pendientes; se detecta si está superado
  assert.strictEqual(await page.$$eval('.det [data-field=documento], .item [data-field=documento]', n => n.length), 0, 'sin campo de documento por control');
  await page.fill('[data-regdoc]', '_KIR-COMR-REF-ESTR-S12P-R06');
  await page.locator('[data-regdoc]').blur();
  await page.waitForSelector('text=Plano superado (FOD 02).');
  await shot('10-doc-superado');
  await page.click('button[data-act=docupdall]');
  await page.waitForFunction(() => document.querySelector('[data-regdoc]').value === 'KIR-COMR-REF-ESTR-S12P-R07');
  assert.ok(!(await page.textContent('main')).includes('Plano superado'), 'la alerta desaparece');

  // 6c. Reinspección: AP sobre el control rechazado cierra la FUM
  await page.click('.item >> nth=1 >> button[data-st=ap]');
  await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día') && !document.getElementById('hdr').textContent.includes('cambios sin enviar'), null, { timeout: 20000 });
  const fumRows2 = await sheetRows('_PIE_FUM', 2, 2);
  assert.deepStrictEqual([fumRows2.rows[0][14], fumRows2.rows[0][17]], ['Cerrada', 'Reinspección AP']);
  const fog2 = await sheetRows('', 18, 18, 'fog');
  assert.ok(/Reinspección aprobada en el PIE/.test(fog2.rows[0][16]) && /^\d{4}-\d{2}-\d{2}$/.test(fog2.rows[0][17]), JSON.stringify(fog2.rows[0].slice(15, 18)));
  const rows3 = await sheetRows('6', T + 1, T + 10);
  assert.strictEqual(rows3.rows[5][6], 'KIR-COMR-REF-ESTR-S12P-R07', 'pendiente con el plano nuevo del registro');
  assert.strictEqual(rows3.rows[9][6], 'KIR-COMR-REF-ESTR-S12P-R07', 'otro pendiente, también');
  assert.strictEqual(rows3.rows[0][6], 'KIR-COMR-EST-P05-R00', 'el ya controlado conserva su plano');

  // 6d. "Siguiente pendiente" lleva al próximo control sin marcar, y las etapas se pliegan
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('button[data-act=nextpend]');
  await page.waitForTimeout(700);
  const firstPendVisible = await page.evaluate(() => { const el = document.querySelector('.item.pend'); const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; });
  assert.ok(firstPendVisible, 'el primer pendiente quedó a la vista');
  await page.click('button[data-act=fold] >> nth=0');
  assert.ok((await page.$$('.item')).length < 46, 'la etapa PRE se plegó');
  await page.click('button[data-act=fold] >> nth=0');
  // tamaños para usar con guantes
  const sizes = await page.evaluate(() => ['.acts .st', '.acts .more', '.filters button'].map(q => Math.round(document.querySelector(q).getBoundingClientRect().height)));
  assert.ok(sizes[0] >= 48 && sizes[1] >= 48 && sizes[2] >= 44, 'botones grandes: ' + sizes);

  // 7. Filtro de pendientes y vista de registro existente con datos
  await page.click('button[data-f=ap]');
  assert.strictEqual(await page.$$eval('.item', n => n.length), 4);
  await shot('08-filtro-ap');
  await page.evaluate(() => { location.hash = '#/fum'; });
  await page.waitForSelector('text=Abiertas · 0');
  await page.waitForSelector('text=Cerradas / anuladas · 1');
  await shot('11-fum');

  // 8. Ajustes
  await page.click('[data-to="/ajustes"]');
  await page.waitForSelector('text=Envíos pendientes · 0');
  await shot('09-ajustes');

  // 9. ancho de celular sin scroll horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!overflow, 'sin scroll horizontal');

  assert.deepStrictEqual(errors.filter(e => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)), []);
  console.log('E2E OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
