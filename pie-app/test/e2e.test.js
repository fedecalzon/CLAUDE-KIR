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
  // buscador de Inicio (§6.10): al escribir sólo cambia la lista; el campo es el mismo y no pierde el foco
  await page.evaluate(() => { document.querySelector('[data-input=search]')._k = 1; });
  await page.fill('[data-input=search]', 'zzzz');
  await page.waitForSelector('#homeList .empty:has-text("No hay planillas con «zzzz»")');
  await page.fill('[data-input=search]', 'hormig');
  await page.waitForSelector('#homeList .row:has-text("HORMIGON ARMADO")');
  assert.ok(await page.evaluate(() => document.querySelector('[data-input=search]')._k === 1 && document.activeElement.dataset.input === 'search'), 'el buscador no se vuelve a dibujar');
  await page.fill('[data-input=search]', '');
  await page.waitForSelector('#homeList .row[data-to="/fum"]');

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
  await page.waitForSelector('#modal .doc:has-text("R07")');
  assert.strictEqual(await page.$$eval('#modal [data-act=pickdoc]', n => n.length), 1, 'un solo resultado por código');
  assert.ok(await page.$eval('#view', e => e.inert), 'con el selector abierto lo de atrás no responde');
  await shot('05a-fod02');
  await page.click('#modal [data-act=pickdoc]');
  assert.strictEqual(await page.inputValue('input[name=documento]'), 'KIR-COMR-REF-ESTR-S12P-R07');
  assert.ok(!(await page.$eval('#view', e => e.inert)) && !(await page.$('#modal')), 'el selector se cerró y lo de atrás vuelve a responder');
  await page.fill('input[name=documento]', 'KIR-COMR-EST-P05-R00');
  await shot('05-nuevo');
  assert.strictEqual(await page.$$eval('input:not([type=file]), select, textarea', els => els.filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length), 0, 'campos ≥ 16 px');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=se crea en el PIE al enviarse');
  await page.waitForSelector('.net:has-text("Sin señal")');
  // indicador: relleno claro = hay cambios sólo en el celular; el texto completo sigue en el DOM
  assert.ok(await page.$eval('.net', e => e.classList.contains('q') && /^Envíos: Sin señal/.test(e.getAttribute('aria-label'))), 'indicador con cambios sin enviar');

  // 4. Cerrar y reabrir la app sin señal (sale del service worker + IndexedDB)
  await page.reload();
  await page.waitForSelector('text=Losa prueba offline L1');
  const items = await page.$$('.item');
  assert.ok(items.length > 20, 'checklist cargado offline: ' + items.length);
  // marcar: primer ítem AP, segundo RZ con FUM y observación, tercero N/A
  await page.click('.item >> nth=0 >> button[data-st=ap]');
  await page.click('.item >> nth=1 >> button[data-st=rz]');
  // con el detalle a la vista, la barra inferior se oculta
  await page.waitForFunction(() => document.body.classList.contains('det-vis') && getComputedStyle(document.querySelector('.bbar')).visibility === 'hidden');
  // RZ abre una FUM (se numera al sincronizar)
  await page.waitForSelector('.item >> nth=1 >> .fumbox:has-text("FUM nueva")');
  await page.fill('.item >> nth=1 >> [data-fum=accionCorrectiva]', 'Rehacer recubrimiento');
  await page.locator('.item >> nth=1 >> [data-fum=accionCorrectiva]').blur();
  await page.fill('.item >> nth=1 >> [data-fum=plazo]', '2026-10-24');
  await page.locator('.item >> nth=1 >> [data-fum=plazo]').blur();
  await page.fill('.item >> nth=1 >> [data-field=obs]', 'Recubrimiento insuficiente');
  await page.locator('.item >> nth=1 >> [data-field=obs]').blur();
  // «Borrar carga» descarta la FUM nueva (no se envió) y «Deshacer» devuelve todo como estaba
  await page.click('.item >> nth=1 >> button[data-act=clear]');
  await page.click('#ask [data-ans=ok]');                          // hoja propia, nunca confirm()
  await page.waitForFunction(() => document.querySelectorAll('.item')[1].classList.contains('pend'));
  assert.strictEqual(await page.$$eval('.item >> nth=1 >> .fumbox', n => n.length), 0, 'la FUM nueva se descartó');
  assert.ok(await page.$eval('#toast', e => e.classList.contains('bottom')), 'el aviso con Deshacer va abajo');
  await page.click('#toast button.act');                           // Deshacer
  await page.waitForFunction(() => document.querySelectorAll('.item')[1].classList.contains('rz'));
  assert.strictEqual(await page.inputValue('.item >> nth=1 >> [data-fum=accionCorrectiva]'), 'Rehacer recubrimiento');
  assert.strictEqual(await page.inputValue('.item >> nth=1 >> [data-fum=plazo]'), '2026-10-24');
  assert.strictEqual(await page.inputValue('.item >> nth=1 >> [data-field=obs]'), 'Recubrimiento insuficiente');
  await page.click('.item >> nth=1 >> button:has-text("Listo")');
  await page.click('.item >> nth=2 >> button[data-st=na]');
  // foto de control sin señal (queda en el celular)
  await page.click('.item >> nth=2 >> button[data-act=more]');
  await page.setInputFiles('.item >> nth=2 >> input[data-photo][multiple]', { name: 'control.png', mimeType: 'image/png', buffer: require('fs').readFileSync(__dirname + '/../app/icon-192.png') });
  await page.waitForSelector('.item >> nth=2 >> .thumbs .t img');
  await page.click('.item >> nth=2 >> button:has-text("Listo")');
  await shot('06-checklist-offline');
  const pending = await page.textContent('.net');
  assert.ok(/Sin señal · \d+/.test(pending), pending);
  // FLOW-02: detalle abierto más abajo y texto escrito sin salir del campo mientras se crea el registro
  await page.click('.item >> nth=10 >> button[data-act=more]');
  await page.fill('.item >> nth=10 >> [data-field=obs]', 'Escrito mientras se crea el registro');
  const y0 = await page.evaluate(() => window.scrollY);
  assert.ok(y0 > 300, 'desplazado hasta el control: ' + y0);

  // 5. Vuelve la señal: sincroniza solo y redirige al registro real
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('.net:has-text("Al día")', { timeout: 20000 });
  // el alta confirmada no salta arriba ni borra lo que se está escribiendo; se dibuja al salir del campo
  assert.ok(/\/r\/h\d+$/.test(await page.evaluate(() => location.hash)), 'la ruta pasa a la fila real');
  const y1 = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(y1 - y0) < 5, 'sin salto: ' + y0 + ' → ' + y1);
  assert.strictEqual(await page.inputValue('.item >> nth=10 >> [data-field=obs]'), 'Escrito mientras se crea el registro');
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.field === 'obs'), 'el campo sigue en edición');
  await page.click('.item >> nth=10 >> button:has-text("Listo")');
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
  await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día') && !document.getElementById('hdr').textContent.includes('cambios sin enviar'), null, { timeout: 20000 });
  const rowObs = (await sheetRows('6', T + 11, T + 11)).rows[0];
  assert.strictEqual(rowObs[11], 'Escrito mientras se crea el registro', 'lo escrito durante el alta llegó a la planilla: ' + JSON.stringify(rowObs));

  // 5b. «Borrar carga» sobre la FUM 4 ya numerada: la anulación queda retenida y «Deshacer» la descarta
  await page.click('.item >> nth=1 >> button[data-act=more]');
  await page.click('.item >> nth=1 >> button[data-act=clear]');
  await page.click('#ask [data-ans=ok]');
  await page.waitForFunction(() => document.querySelectorAll('.item')[1].classList.contains('pend'));
  await page.click('#toast button.act');                           // Deshacer
  await page.waitForSelector('.item >> nth=1 >> .fumbox:has-text("FUM N° 4")');
  assert.ok(await page.$eval('.item >> nth=1', e => e.classList.contains('rz')), 'vuelve a RZ');
  await page.click('.item >> nth=1 >> button:has-text("Listo")');
  // si la anulación siguiera en la cola, «Al día» llegaría recién después de enviarla (a los 6 s)
  await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día') && !document.getElementById('hdr').textContent.includes('cambios sin enviar'), null, { timeout: 20000 });
  assert.strictEqual((await sheetRows('_PIE_FUM', 2, 2)).rows[0][14], 'Abierta', 'Deshacer no anuló la FUM 4');
  const rowU = (await sheetRows('6', T + 2, T + 2)).rows[0];
  assert.deepStrictEqual([rowU[9], String(rowU[10]), rowU[11]], ['RZ', '4', 'Recubrimiento insuficiente'], 'el control quedó como estaba');

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
  await page.click('button[data-act=docpick][data-target=default]');
  await page.fill('#modal input[data-input=docq]', '_KIR-COMR-REF-ESTR-S12P-R06');
  await page.click('#modal [data-act=pickfree]');
  await page.waitForSelector('.note.err:has-text("Plano superado")');
  await shot('10-doc-superado');
  // marcar AP con el plano superado: hoja con tres salidas; «No marcar» deja el control como estaba
  await page.click('.item.pend >> nth=0 >> button[data-st=ap]');
  await page.waitForSelector('#ask [data-ans=alt]');
  assert.strictEqual(await page.$$eval('#ask [data-ans]', n => n.length), 3, 'pasar a la vigente · marcar con la vieja · no marcar');
  assert.ok(await page.$eval('#view', e => e.inert), 'lo de atrás no responde');
  await shot('10b-ask-plano');
  const pendBefore = await page.$$eval('.item.pend', n => n.length);
  await page.click('#ask [data-ans=cancel]');
  assert.strictEqual(await page.$$('#ask').then(n => n.length), 0, 'la hoja se cerró');
  assert.strictEqual(await page.$$eval('.item.pend', n => n.length), pendBefore, 'no marcó nada');
  await page.click('button[data-act=docupdall]');
  await page.waitForFunction(() => document.querySelector('[data-regdoc]').dataset.value === 'KIR-COMR-REF-ESTR-S12P-R07');
  assert.ok(!(await page.textContent('main')).includes('Plano superado'), 'la alerta desaparece');

  // 6c. Reinspección: AP sobre el control rechazado cierra la FUM
  await page.click('.item >> nth=1 >> button[data-st=ap]');
  await page.click('#ask [data-ans=ok]');                          // «Cerrar FUM y marcar AP»
  // el cierre queda retenido 6 s y se ofrece Deshacer, abajo (al alcance del pulgar)
  await page.waitForSelector('#toast.show.bottom:has-text("FUM N° 4 se cierra al enviar")');
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
  assert.ok(sizes[0] >= 56 && sizes[1] >= 56 && sizes[2] >= 48, 'botones grandes: ' + sizes);

  // 6e. Doble toque no desmarca; RZ corregido con el detalle abierto no crea FUM; con filtro, lo marcado no desaparece
  await page.dblclick('.item >> nth=5 >> button[data-st=na]');
  assert.ok(await page.$eval('.item >> nth=5', e => e.classList.contains('na')), 'el doble toque no desmarca');
  assert.ok(!(await page.$eval('#toast', e => e.classList.contains('show') && e.textContent.includes('Ya está en'))), 'el segundo toque se ignora sin aviso');
  await page.click('.item >> nth=6 >> button[data-st=rz]');
  await page.waitForSelector('.item >> nth=6 >> .fumbox');
  await page.waitForTimeout(800);                                   // pasa el bloqueo de 700 ms del control
  await page.click('.item >> nth=6 >> button[data-st=na]');         // FUM retenida → se descarta sin preguntar
  assert.strictEqual(await page.$$eval('.item >> nth=6 >> .fumbox', n => n.length), 0, 'sin FUM');
  await page.click('.item >> nth=6 >> button:has-text("Listo")');
  await page.click('button[data-f=pend]');
  const nPend = await page.$$eval('.item', n => n.length);
  await page.click('.item >> nth=0 >> button[data-st=na]');
  assert.strictEqual(await page.$$eval('.item', n => n.length), nPend, 'el control marcado sigue en la lista');
  assert.ok(await page.$eval('.item >> nth=0', e => e.classList.contains('na') && e.classList.contains('kept')), 'queda a la vista, atenuado');
  await page.click('button[data-f=all]');
  await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día'), null, { timeout: 20000 });

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
  assert.strictEqual(await page.$$eval('input:not([type=file]), select, textarea', els => els.filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length), 0, 'campos ≥ 16 px');
  await shot('09-ajustes');
  // Apariencia (§5.8): Oscuro forzado cambia el tema y la barra de estado; Automático vuelve a seguir al sistema
  await page.click('button[data-act=theme][data-theme=dark]');
  assert.ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark' &&
    [...document.querySelectorAll('meta[name=theme-color]')].every(m => m.getAttribute('content') === '#142338') &&
    document.querySelector('button[data-act=theme][data-theme=dark]').getAttribute('aria-pressed') === 'true'), 'tema oscuro forzado');
  await page.click('button[data-act=theme][data-theme=auto]');
  assert.ok(await page.evaluate(() => !document.documentElement.hasAttribute('data-theme') && localStorage.getItem('pie.theme') === '"auto"'), 'vuelve a automático');
  // Conexión: el enlace equivocado no se guarda y el error queda debajo del campo (no en un aviso que se va)
  const api0 = await page.inputValue('#cfgForm [name=apiUrl]');
  await page.fill('#cfgForm [name=apiUrl]', 'https://docs.google.com/spreadsheets/d/abc/edit');
  await page.click('#cfgForm button[type=submit]');
  await page.waitForSelector('#cfgForm .field-err:has-text("Ese es el enlace de la planilla")');
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pie.settings')).apiUrl), api0, 'no se guardó el enlace equivocado');
  await page.fill('#cfgForm [name=apiUrl]', api0);

  // 9. ancho de celular sin scroll horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!overflow, 'sin scroll horizontal');
  // iPhone SE: el indicador queda compacto, pero el texto completo sigue en el DOM
  await page.setViewportSize({ width: 320, height: 568 });
  assert.ok((await page.textContent('.net')).includes('Al día'), 'texto del indicador en el DOM');
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'sin scroll horizontal a 320');
  // iPhone SE en el registro: resumen compacto, criterio del primer control a la vista, filtros y botones enteros
  await page.evaluate((t) => { location.hash = '#/c/6/r/h' + t; }, T);
  await page.waitForSelector('.sum');
  await page.evaluate(() => window.scrollTo(0, 0));
  const se = await page.evaluate(() => {
    const crit = document.querySelector('.item .crit').getBoundingClientRect();
    const f = [...document.querySelectorAll('.filters button')].map(b => b.getBoundingClientRect());
    return { sum: Math.round(document.querySelector('.sum').getBoundingClientRect().height), critTop: Math.round(crit.top), h: innerHeight,
      filtersIn: f.every(r => r.left >= 0 && r.right <= innerWidth), st: Math.round(document.querySelector('.acts .st').getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(se.sum <= 160 && se.critTop < se.h - 80 && se.filtersIn && se.st >= 56 && !se.overflow, 'registro en el SE: ' + JSON.stringify(se));

  assert.deepStrictEqual(errors.filter(e => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)), []);
  console.log('E2E OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
