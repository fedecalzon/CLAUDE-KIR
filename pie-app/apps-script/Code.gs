/**
 * PIE · Carga móvil de Planes de Inspección y Ensayo (FOP 01)
 * KIR S.A. – Obra COMAFI Reconquista
 *
 * Backend en Google Apps Script vinculado a la planilla "PIE - CORE".
 *  - Lee cada hoja (una por categoría) y detecta los bloques PIE ya cargados
 *    (encabezado RESPONSABLE / PISO / SECTOR / ETAPA + tabla TAREA...).
 *  - Crea un bloque nuevo copiando formato, combinaciones y validaciones del
 *    bloque modelo y lo ubica debajo del último bloque de la hoja.
 *  - Actualiza DOCUMENTO / FECHA / RESP. / ESTADO / FUM N° / OBSERVACIONES.
 *  - Lista los documentos del FOD 02 (sólo la última revisión de cada código)
 *    para elegir el DOCUMENTO contra el que se controla.
 *  - Guarda fotos de control en Drive y las vincula a la fila (nota en la celda
 *    de OBSERVACIONES + índice en la hoja oculta _PIE_FOTOS).
 *  - Expone una API JSON (doGet/doPost) y sirve la app (Index.html).
 *
 * Las operaciones llegan en lotes desde la cola offline del celular y son
 * idempotentes: cada una tiene un id que queda registrado en la hoja oculta
 * _PIE_LOG, así un reintento nunca duplica un bloque.
 */

var PIE = {
  VERSION: '1.1.0',
  DATOS_SHEET: 'DATOS',
  LOG_SHEET: '_PIE_LOG',
  FOTOS_SHEET: '_PIE_FOTOS',
  FOD_SHEET: 'FOD-02',   // pestaña del Registro de Control y Distribución de Documentos
  FOTOS_FOLDER_NAME: 'PIE - Fotos de control',
  DATE_FORMAT: 'dd/mm/yy',
  MAX_COLS: 30,          // columnas a leer por hoja (los bloques usan A:O)
  HEADER_LOOKBACK: 7,    // filas por encima de TAREA donde buscar el encabezado
  DEFAULT_GAP: 2,        // filas vacías entre bloques si la hoja tiene uno solo
  // Agrupación de las planillas para navegar desde el celular.
  RUBROS: [
    ['Demoliciones y suelos', ['1', '2', '3', '4']],
    ['Fundaciones y estructuras', ['5A', '5 B', '5B', '5C', '5D', '6', '7', '21', '22', '42', '43', '44']],
    ['Albañilería y obra húmeda', ['8', '9', '10', '12', '13', '14', '15']],
    ['Construcción en seco', ['11', '16']],
    ['Carpinterías', ['19', '20']],
    ['Cubiertas', ['23', '24', '25']],
    ['Instalaciones', ['26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '41']],
    ['Terminaciones', ['17', '18', '38', '39', '40']]
  ]
};

var FILL_FIELDS = ['documento', 'fecha', 'resp', 'estado', 'fum', 'obs'];

/* ------------------------------------------------------------------ */
/*  Menú, panel lateral y web app                                       */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('PIE')
    .addItem('Abrir carga PIE (panel)', 'abrirPanel')
    .addSeparator()
    .addItem('Configurar clave de acceso', 'configurarClave')
    .addItem('Vincular FOD 02 (registro de documentos)', 'vincularFod02')
    .addItem('Ver enlace de la app', 'verEnlace')
    .addToUi();
}

function abrirPanel() {
  var out = serveApp_('sidebar').setTitle('PIE · Carga');
  SpreadsheetApp.getUi().showSidebar(out);
}

function configurarClave() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var actual = props.getProperty('PIE_TOKEN');
  var r = ui.prompt('Clave de acceso',
    'Clave que pedirá la app en el celular (vacío = sin clave).' +
    (actual ? '\nClave actual: ' + actual : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = r.getResponseText().trim();
  if (v) props.setProperty('PIE_TOKEN', v); else props.deleteProperty('PIE_TOKEN');
  ui.alert(v ? 'Clave guardada.' : 'Clave eliminada: la API queda abierta a quien tenga el enlace.');
}

function vincularFod02() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var actual = props.getProperty('FOD02_ID');
  var r = ui.prompt('FOD 02',
    'Pegá el enlace de la Hoja de cálculo de Google del FOD 02 (Registro de Control y Distribución de Documentos).\n' +
    'Vacío = usar una pestaña "' + PIE.FOD_SHEET + '" dentro de esta misma planilla.' +
    (actual ? '\nVinculado ahora: ' + actual : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = r.getResponseText().trim();
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(v);
  var id = m ? m[1] : v;
  if (!id) { props.deleteProperty('FOD02_ID'); ui.alert('Se usará la pestaña ' + PIE.FOD_SHEET + ' de esta planilla.'); return; }
  try {
    var fod = parseFod_(readValues_(fodSheet_(SpreadsheetApp.openById(id))));
    props.setProperty('FOD02_ID', id);
    ui.alert('FOD 02 vinculado: ' + fod.docs.length + ' documentos (última revisión de cada código).');
  } catch (err) {
    ui.alert('No se pudo abrir el FOD 02: ' + err.message);
  }
}

function verEnlace() {
  var url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url
    ? 'Enlace de la web app:\n' + url + '\n\nPara la versión offline (PWA) usá este enlace como "URL de la API".'
    : 'Todavía no hay implementación. Implementar > Nueva implementación > Aplicación web.');
}

/** Panel lateral: selecciona la fila del registro en la planilla. */
function irA(sheetName, row) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) return;
  if (sh.isSheetHidden()) sh.showSheet();
  sh.activate();
  sh.setActiveRange(sh.getRange(row, 1, 1, 12));
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return json_(safeHandle_(p));
  return serveApp_('webapp');
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }
  return json_(safeHandle_(req));
}

/** Punto de entrada para google.script.run (web app y panel lateral). */
function api(req) {
  return safeHandle_(req || {});
}

function serveApp_(mode) {
  var boot = { mode: mode, version: PIE.VERSION };
  if (mode === 'sidebar') boot.token = PropertiesService.getScriptProperties().getProperty('PIE_TOKEN') || '';
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent()
    .replace('/*PIE_BOOT*/', 'window.PIE_BOOT=' + JSON.stringify(boot) + ';');
  return HtmlService.createHtmlOutput(html)
    .setTitle('PIE · Carga')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  API                                                                 */
/* ------------------------------------------------------------------ */

function safeHandle_(req) {
  try {
    return handle_(req);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err), code: err && err.code || 'error' };
  }
}

function handle_(req) {
  var token = PropertiesService.getScriptProperties().getProperty('PIE_TOKEN');
  if (token && String(req.token || '') !== token) throw pieError_('Clave de acceso incorrecta', 'auth');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  switch (req.action) {
    case 'ping':
      return { ok: true, version: PIE.VERSION };
    case 'catalog':
      return catalog_(ss);
    case 'sheet':
      return { ok: true, categoria: readCategory_(sheetOrThrow_(ss, req.sheet)) };
    case 'batch':
      var ops = typeof req.ops === 'string' ? JSON.parse(req.ops) : req.ops;
      return batch_(ss, ops || []);
    default:
      throw pieError_('Acción desconocida: ' + req.action, 'bad_request');
  }
}

function catalog_(ss) {
  var cats = [];
  var fotos = readFotosIndex_(ss);
  ss.getSheets().forEach(function (sh) {
    if (!isCategorySheet_(sh.getName())) return;
    var cat = readCategory_(sh, fotos);
    if (cat.registros.length) cats.push(cat);
  });
  return {
    ok: true,
    version: PIE.VERSION,
    generado: new Date().toISOString(),
    datos: readDatos_(ss),
    fod: readFodSafe_(ss),
    categorias: cats
  };
}

function batch_(ss, ops) {
  var lock = LockService.getDocumentLock() || LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw pieError_('La planilla está ocupada, reintentá en unos segundos', 'busy');
  var results = [];
  var touched = {};
  try {
    var log = logSheet_(ss);
    ops.forEach(function (op) {
      try {
        if (!op || !op.id) throw pieError_('Operación sin id', 'bad_request');
        var prev = findLog_(log, op.id);
        if (prev) {
          results.push({ id: op.id, ok: true, dup: true, sheet: prev.sheet, h: prev.h, url: prev.url });
          touched[prev.sheet] = true;
          return;
        }
        var res;
        if (op.op === 'create') res = opCreate_(ss, op);
        else if (op.op === 'update') res = opUpdate_(ss, log, op);
        else if (op.op === 'photo') res = opPhoto_(ss, log, op);
        else throw pieError_('Operación desconocida: ' + op.op, 'bad_request');
        log.appendRow([op.id, new Date(), op.op, op.sheet, res.h, op.by || '', res.warnings ? res.warnings.join(' | ') : '', res.url || '']);
        touched[op.sheet] = true;
        results.push({ id: op.id, ok: true, sheet: op.sheet, h: res.h, url: res.url, warnings: res.warnings || [] });
      } catch (err) {
        results.push({ id: op && op.id, ok: false, error: String(err.message || err), code: err.code || 'error' });
      }
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  var fotos = readFotosIndex_(ss);
  var cats = Object.keys(touched).map(function (name) {
    return readCategory_(ss.getSheetByName(name), fotos);
  });
  return { ok: true, results: results, categorias: cats };
}

/* ------------------------------------------------------------------ */
/*  Lectura                                                             */
/* ------------------------------------------------------------------ */

function isCategorySheet_(name) {
  return name !== PIE.DATOS_SHEET && name !== PIE.FOD_SHEET && name.charAt(0) !== '_';
}

function sheetOrThrow_(ss, name) {
  var sh = name && isCategorySheet_(String(name)) ? ss.getSheetByName(String(name)) : null;
  if (!sh) throw pieError_('No existe la planilla "' + name + '"', 'not_found');
  return sh;
}

function readValues_(sh) {
  var lr = sh.getLastRow();
  var lc = Math.min(sh.getLastColumn(), PIE.MAX_COLS);
  if (!lr || !lc) return [];
  var tz = Session.getScriptTimeZone();
  return sh.getRange(1, 1, lr, lc).getValues().map(function (row) {
    return row.map(function (v) {
      return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
  });
}

function readCategory_(sh, fotos) {
  var parsed = parseSheet_(readValues_(sh));
  return toClientCategory_(sh.getName(), parsed, sh.isSheetHidden(), (fotos || {})[sh.getName()]);
}

/* ---------- FOD 02 ---------- */

function fodSheet_(book) {
  var sh = book.getSheetByName(PIE.FOD_SHEET);
  if (sh) return sh;
  // si la pestaña tiene otro nombre, la que tenga la columna "CÓDIGO DEL DOCUMENTO/PLANO"
  var all = book.getSheets();
  for (var i = 0; i < all.length; i++) {
    var head = all[i].getRange(1, 1, Math.min(30, Math.max(1, all[i].getLastRow())), Math.min(20, Math.max(1, all[i].getLastColumn()))).getValues();
    if (head.some(function (row) { return row.some(function (v) { return key_(v).indexOf('CODIGO DEL DOCUMENTO') === 0; }); })) return all[i];
  }
  throw pieError_('No se encontró la pestaña del FOD 02', 'config');
}

function readFodSafe_(ss) {
  var id = PropertiesService.getScriptProperties().getProperty('FOD02_ID');
  try {
    var book = id ? SpreadsheetApp.openById(id) : ss;
    if (!id && !book.getSheetByName(PIE.FOD_SHEET)) return { docs: [], aviso: 'FOD 02 sin vincular (menú PIE › Vincular FOD 02)' };
    return parseFod_(readValues_(fodSheet_(book)));
  } catch (err) {
    return { docs: [], aviso: 'No se pudo leer el FOD 02: ' + err.message };
  }
}

/* ---------- Fotos ---------- */

function fotosSheet_(ss) {
  var sh = ss.getSheetByName(PIE.FOTOS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PIE.FOTOS_SHEET);
    sh.appendRow(['fecha', 'planilla', 'fila_tarea', 'offset', 'fila', 'criterio', 'elemento', 'inspector', 'archivo_id', 'enlace']);
    sh.hideSheet();
  }
  return sh;
}

/** { planilla: { filaTarea: { offset: [[id, url], ...] } } } */
function readFotosIndex_(ss) {
  var sh = ss.getSheetByName(PIE.FOTOS_SHEET);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().forEach(function (r) {
    var s = String(r[1]), h = Number(r[2]), off = Number(r[3]);
    if (!s || !h) return;
    out[s] = out[s] || {};
    out[s][h] = out[s][h] || {};
    (out[s][h][off] = out[s][h][off] || []).push([String(r[8]), String(r[9])]);
  });
  return out;
}

function photoFolder_(ss, sheetName, title) {
  var props = PropertiesService.getScriptProperties();
  var root = null;
  var id = props.getProperty('PIE_FOTOS_FOLDER');
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.getRootFolder().createFolder(PIE.FOTOS_FOLDER_NAME + ' - ' + ss.getName());
    props.setProperty('PIE_FOTOS_FOLDER', root.getId());
  }
  var name = sheetName + ' - ' + (title || '').slice(0, 60);
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function readDatos_(ss) {
  var sh = ss.getSheetByName(PIE.DATOS_SHEET);
  return parseDatos_(sh ? readValues_(sh) : []);
}

/* ------------------------------------------------------------------ */
/*  Escritura                                                           */
/* ------------------------------------------------------------------ */

function opCreate_(ss, op) {
  var sh = sheetOrThrow_(ss, op.sheet);
  var parsed = parseSheet_(readValues_(sh));
  var blocks = parsed.blocks;
  if (!blocks.length) throw pieError_('La planilla ' + op.sheet + ' no tiene un bloque modelo', 'conflict');

  var base = pickBaseBlock_(blocks, op.base);
  var last = blocks[blocks.length - 1];
  var start = Math.max(last.endRow, sh.getLastRow()) + blockGap_(blocks) + 1;
  var height = base.endRow - base.startRow + 1;
  var maxCols = sh.getMaxColumns();

  var needRows = start + height - 1 - sh.getMaxRows();
  if (needRows > 0) sh.insertRowsAfter(sh.getMaxRows(), needRows);

  var dst = sh.getRange(start, 1, height, maxCols);
  dst.breakApart();
  sh.getRange(base.startRow, 1, height, maxCols).copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
  copyRowHeights_(sh, base.startRow, start, height);

  var nb = shiftBlock_(base, start - base.startRow);
  var warnings;
  try {
    withoutValidation_(sh, nb.startRow, nb.endRow, function () {
      writeHeader_(sh, nb, op.header || {}, true);
      warnings = writeItems_(sh, nb, op.items || {}, true);
    });
  } catch (err) {
    // no dejar un bloque a medio crear: el reintento lo volvería a agregar
    dst.clear();
    dst.clearDataValidations();
    dst.breakApart();
    throw err;
  }
  if (sh.isSheetHidden()) sh.showSheet();
  return { h: nb.tareaRow, warnings: warnings };
}

function resolveBlock_(sh, log, op) {
  var parsed = parseSheet_(readValues_(sh));
  var h = op.h;
  if (!h && op.ref) {
    var created = findLog_(log, op.ref);
    if (!created) throw pieError_('El registro todavía no fue creado', 'retry');
    h = created.h;
  }
  var blk = locateBlock_(parsed.blocks, h, op.sig, op.elemento);
  if (!blk) throw pieError_('No se encontró el registro (¿se movieron filas en la planilla?)', 'conflict');
  return { blk: blk, title: parsed.title };
}

function opUpdate_(ss, log, op) {
  var sh = sheetOrThrow_(ss, op.sheet);
  var blk = resolveBlock_(sh, log, op).blk;
  var warnings = [];
  withoutValidation_(sh, blk.startRow, blk.endRow, function () {
    if (op.header) writeHeader_(sh, blk, op.header, false);
    if (op.items) warnings = writeItems_(sh, blk, op.items, false);
  });
  return { h: blk.tareaRow, warnings: warnings };
}

function opPhoto_(ss, log, op) {
  if (!op.data) throw pieError_('La foto llegó vacía', 'bad_request');
  var sh = sheetOrThrow_(ss, op.sheet);
  var found = resolveBlock_(sh, log, op);
  var blk = found.blk;
  var warnings = [];
  var req = {};
  req[op.off] = { criterio: op.criterio, tarea: op.tarea };
  var offs = Object.keys(resolveItemOffsets_(blk, req, warnings));
  if (!offs.length) throw pieError_('No se encontró el control de la foto en la planilla', 'conflict');
  var off = Number(offs[0]);
  var row = blk.tareaRow + off;
  var item = blk.items.filter(function (it) { return it.off === off; })[0] || {};
  var tz = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss');
  var name = [op.sheet, 'F' + row, (blk.header.elemento || '').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 40), stamp].join('_') + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(op.data), op.mime || 'image/jpeg', name);
  var file = photoFolder_(ss, op.sheet, found.title).createFile(blob);
  file.setDescription('PIE planilla ' + op.sheet + ' fila ' + row + ' · ' + (item.criterio || '') + ' · ' + (op.by || ''));
  var url = file.getUrl();
  var cell = sh.getRange(row, blk.cols.obs || blk.cols.estado || blk.cols.criterio);
  var note = cell.getNote();
  cell.setNote((note ? note + '\n' : '') + 'Foto ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yy') + ': ' + url);
  fotosSheet_(ss).appendRow([new Date(), op.sheet, blk.tareaRow, off, row, item.criterio || '', blk.header.elemento || '', op.by || '', file.getId(), url]);
  return { h: blk.tareaRow, url: url, warnings: warnings };
}

/**
 * Las planillas traen validaciones en modo "rechazar" con listas cortas
 * (ESTADO sólo admite DATOS!J15 = "AP"; RESPONSABLE sólo 3 nombres), lo que
 * hacía fallar la carga con "los datos de la celda X infringen las reglas de
 * validación". Se quitan mientras escribe el script y se restauran tal cual.
 */
function withoutValidation_(sh, r0, r1, fn) {
  var rng = sh.getRange(r0, 1, r1 - r0 + 1, Math.min(sh.getMaxColumns(), PIE.MAX_COLS));
  var rules = rng.getDataValidations();
  var any = rules.some(function (row) { return row.some(function (x) { return !!x; }); });
  if (!any) return fn();
  rng.clearDataValidations();
  try {
    return fn();
  } finally {
    rng.setDataValidations(rules);
  }
}

function writeHeader_(sh, blk, header, clearMissing) {
  var hd = blk.header;
  var resp = header.responsables;
  if (resp || clearMissing) {
    resp = resp || [];
    hd.respCells.forEach(function (cell, i) {
      sh.getRange(cell.r, cell.c).setValue(resp[i] || '');
      if (cell.c > 1) {
        var ref = columnLetter_(cell.c) + cell.r;
        sh.getRange(cell.r, cell.c - 1)
          .setFormula('=IFERROR(VLOOKUP(' + ref + ',' + PIE.DATOS_SHEET + '!$D$12:$E$60,2,0),"")');
      }
    });
  }
  ['piso', 'sector', 'etapa', 'elemento'].forEach(function (k) {
    var cell = hd.cells[k];
    if (!cell) return;
    if (header.hasOwnProperty(k)) sh.getRange(cell.r, cell.c).setValue(header[k] == null ? '' : header[k]);
    else if (clearMissing) sh.getRange(cell.r, cell.c).setValue('');
  });
}

/**
 * Escribe las columnas de carga del bloque. `items` es un mapa
 * { offset: {criterio, documento, fecha, resp, estado, fum, obs} } donde
 * offset = fila - fila TAREA. Sólo se tocan los campos presentes.
 */
function writeItems_(sh, blk, items, clearAll) {
  var cols = FILL_FIELDS.map(function (f) { return blk.cols[f]; }).filter(function (c) { return c; });
  var warnings = [];
  if (!cols.length) return warnings;
  var c0 = Math.min.apply(null, cols);
  var c1 = Math.max.apply(null, cols);
  var nRows = blk.endRow - blk.tareaRow;
  if (nRows < 1) return warnings;
  var rng = sh.getRange(blk.tareaRow + 1, c0, nRows, c1 - c0 + 1);
  var vals = rng.getValues();
  var fms = rng.getFormulas();
  var out = vals.map(function (row, i) {
    return row.map(function (v, j) { return fms[i][j] || v; });
  });

  if (clearAll) {
    out.forEach(function (row) {
      FILL_FIELDS.forEach(function (f) { if (blk.cols[f]) row[blk.cols[f] - c0] = ''; });
    });
  }

  var resolved = resolveItemOffsets_(blk, items, warnings);
  Object.keys(resolved).forEach(function (off) {
    var it = resolved[off];
    var row = out[off - 1];
    FILL_FIELDS.forEach(function (f) {
      if (!blk.cols[f] || !it.hasOwnProperty(f)) return;
      row[blk.cols[f] - c0] = toCellValue_(f, it[f]);
    });
  });

  rng.setValues(out);
  if (blk.cols.fecha) sh.getRange(blk.tareaRow + 1, blk.cols.fecha, nRows, 1).setNumberFormat(PIE.DATE_FORMAT);
  return warnings;
}

function toCellValue_(field, v) {
  if (v == null) return '';
  v = String(v).trim();
  if (field === 'fecha') {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return v;
}

function copyRowHeights_(sh, fromRow, toRow, n) {
  for (var i = 0; i < n; i++) {
    sh.setRowHeight(toRow + i, sh.getRowHeight(fromRow + i));
  }
}

function logSheet_(ss) {
  var sh = ss.getSheetByName(PIE.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PIE.LOG_SHEET);
    sh.appendRow(['op_id', 'fecha', 'accion', 'planilla', 'fila_tarea', 'inspector', 'avisos', 'enlace']);
    sh.hideSheet();
  }
  return sh;
}

function findLog_(log, id) {
  var hit = log.getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!hit) return null;
  var row = log.getRange(hit.getRow(), 1, 1, 8).getValues()[0];
  return { sheet: String(row[3]), h: Number(row[4]), url: String(row[7] || '') };
}

function columnLetter_(c) {
  var s = '';
  while (c > 0) {
    var m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function pieError_(msg, code) {
  var e = new Error(msg);
  e.code = code;
  return e;
}

/* ------------------------------------------------------------------ */
/*  Parser puro (sin servicios de Google: testeable fuera de Apps Script) */
/* ------------------------------------------------------------------ */

function txt_(v) {
  return v == null ? '' : String(v).replace(/ /g, ' ').trim();
}

function key_(v) {
  return txt_(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function hash_(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Identifica el nombre de campo de un encabezado de la tabla TAREA. */
function headerField_(label) {
  var k = key_(label);
  if (!k) return null;
  if (k === 'TAREA') return 'tarea';
  if (k === 'MUESTRA') return 'muestra';
  if (k.indexOf('CRITERIO') === 0) return 'criterio';
  if (k.indexOf('INSPECCION') >= 0) return 'metodo';
  if (k.indexOf('INSTRUMENTO') === 0) return 'instrumento';
  if (k.indexOf('DOCUMENTO') === 0) return 'documento';
  if (k === 'FECHA') return 'fecha';
  if (k.indexOf('RESP') === 0) return 'resp';
  if (k === 'ESTADO') return 'estado';
  if (k.indexOf('FUM') === 0) return 'fum';
  if (k.indexOf('OBSERVACION') === 0) return 'obs';
  return null;
}

/**
 * Detecta los bloques PIE de una hoja. Filas y columnas en base 1.
 * Ancla: la fila con "TAREA". El encabezado (RESPONSABLE, PISO, SECTOR,
 * ETAPA, ELEMENTO A VERIFICAR) se busca en las filas inmediatamente superiores.
 */
function parseSheet_(values) {
  var nRows = values.length;
  var cell = function (r, c) { return r >= 1 && r <= nRows ? values[r - 1][c - 1] : undefined; };
  var title = txt_(cell(1, 7)).replace(/\s*\n\s*/g, ' ');

  var tareaRows = [];
  for (var r = 1; r <= nRows; r++) {
    for (var c = 1; c <= 4; c++) {
      if (key_(cell(r, c)) === 'TAREA') { tareaRows.push({ r: r, c: c }); break; }
    }
  }

  var blocks = [];
  var prevEnd = 0;
  tareaRows.forEach(function (t, idx) {
    var T = t.r;
    var width = values[T - 1].length;
    var cols = {};
    for (var c = 1; c <= width; c++) {
      var f = headerField_(cell(T, c));
      if (f && !cols[f]) cols[f] = c;
    }
    cols.etapa = cols.tarea > 1 ? cols.tarea - 1 : null;

    // Encabezado
    var top = Math.max(prevEnd + 1, T - PIE.HEADER_LOOKBACK);
    var respTitleRow = null;
    for (var r = top; r < T; r++) {
      for (var c = 1; c <= 8; c++) if (key_(cell(r, c)) === 'RESPONSABLE') { respTitleRow = r; break; }
      if (respTitleRow) break;
    }
    var cells = {};
    var labelRows = [];
    var labels = { 'PISO': 'piso', 'SECTOR': 'sector', 'ETAPA': 'etapa' };
    var elementoCol = null;
    for (var r = respTitleRow || top; r < T; r++) {
      for (var c = 1; c <= width; c++) {
        var k = key_(cell(r, c));
        if (labels[k] && !cells[labels[k]]) { cells[labels[k]] = { r: r, c: c + 1 }; labelRows.push(r); }
        if (k === 'ELEMENTO A VERIFICAR') { elementoCol = c; cells.elemento = { r: r + 1, c: c }; }
      }
    }
    // Bloques sin título: el elemento va en la fila de PISO, columna del ELEMENTO (= DOCUMENTO).
    if (!cells.elemento && cells.piso && cols.documento) cells.elemento = { r: cells.piso.r, c: cols.documento };
    var respCol = cols.tarea || 2;
    var firstHeader = respTitleRow ? respTitleRow + 1 : (labelRows.length ? Math.min.apply(null, labelRows) : T);
    var respCells = [];
    for (var r = firstHeader; r < T; r++) {
      var hasLabel = labelRows.indexOf(r) >= 0;
      var hasName = txt_(cell(r, respCol)) !== '' || (respCol > 1 && txt_(cell(r, respCol - 1)) !== '');
      if (hasLabel || hasName) respCells.push({ r: r, c: respCol });
    }
    var startRow = respTitleRow || (respCells.length ? respCells[0].r : T);

    // Fin del bloque: última fila con contenido antes del próximo encabezado.
    var nextT = idx + 1 < tareaRows.length ? tareaRows[idx + 1].r : nRows + 1;
    var limit = nextT - 1;
    if (idx + 1 < tareaRows.length) {
      // las filas de encabezado del bloque siguiente no pertenecen a éste
      for (var r = Math.max(T + 1, nextT - PIE.HEADER_LOOKBACK); r < nextT; r++) {
        var rowKeys = [];
        for (var c = 1; c <= 8; c++) rowKeys.push(key_(cell(r, c)));
        if (rowKeys.indexOf('RESPONSABLE') >= 0 || rowKeys.indexOf('PISO') >= 0) { limit = r - 1; break; }
      }
    }
    var lastCol = Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k] || 0; }));
    var endRow = T;
    for (var r = T + 1; r <= limit; r++) {
      for (var c = 1; c <= lastCol; c++) if (txt_(cell(r, c)) !== '') { endRow = r; break; }
    }

    // Ítems
    var items = [];
    var cur = { etapa: '', tarea: '', muestra: '' };
    for (var r = T + 1; r <= endRow; r++) {
      var get = function (f) { return cols[f] ? cell(r, cols[f]) : ''; };
      if (txt_(get('etapa'))) { cur.etapa = txt_(get('etapa')); }
      if (txt_(get('tarea'))) { cur.tarea = txt_(get('tarea')); cur.muestra = ''; }
      var mu = get('muestra');
      if (txt_(mu) !== '') cur.muestra = mu;
      var crit = txt_(get('criterio'));
      if (!crit) continue;
      items.push({
        off: r - T,
        etapa: cur.etapa,
        tarea: cur.tarea,
        muestra: cur.muestra,
        criterio: crit,
        metodo: txt_(get('metodo')),
        instrumento: txt_(get('instrumento')),
        documento: txt_(get('documento')),
        fecha: txt_(get('fecha')),
        resp: txt_(get('resp')),
        estado: txt_(get('estado')).toUpperCase(),
        fum: txt_(get('fum')),
        obs: txt_(get('obs'))
      });
    }

    var val = function (k) { return cells[k] ? txt_(cell(cells[k].r, cells[k].c)) : ''; };
    blocks.push({
      startRow: startRow,
      tareaRow: T,
      endRow: endRow,
      hasTitle: !!respTitleRow,
      cols: cols,
      header: {
        respCells: respCells,
        cells: cells,
        responsables: respCells.map(function (rc) { return txt_(cell(rc.r, rc.c)); }),
        piso: val('piso'),
        sector: val('sector'),
        etapa: val('etapa'),
        elemento: val('elemento')
      },
      items: items,
      sig: hash_(items.map(function (it) { return key_(it.criterio); }).join('|'))
    });
    prevEnd = endRow;
  });

  // Algunos bloques tienen rótulos faltantes (p. ej. sin "OBSERVACIONES"):
  // se completan con la columna que usa el resto de la hoja.
  var sheetCols = {};
  blocks.forEach(function (b) {
    Object.keys(b.cols).forEach(function (f) { if (b.cols[f] && !sheetCols[f]) sheetCols[f] = b.cols[f]; });
  });
  blocks.forEach(function (b) {
    Object.keys(sheetCols).forEach(function (f) {
      if (b.cols[f]) return;
      var col = sheetCols[f];
      var taken = Object.keys(b.cols).some(function (g) { return b.cols[g] === col; });
      if (!taken) {
        b.cols[f] = col;
        b.items.forEach(function (it) {
          if (FILL_FIELDS.indexOf(f) >= 0) {
            var v = txt_(cell(b.tareaRow + it.off, col));
            it[f] = f === 'estado' ? v.toUpperCase() : v;
          }
        });
      }
    });
  });
  return { title: title, blocks: blocks };
}

function pickBaseBlock_(blocks, base) {
  var last = blocks[blocks.length - 1];
  if (base && base.h) {
    var exact = blocks.filter(function (b) { return b.tareaRow === base.h && (!base.sig || b.sig === base.sig); })[0];
    if (exact && exact.hasTitle) return exact;
    if (exact) base = { sig: exact.sig };
  }
  var sig = (base && base.sig) || last.sig;
  var same = blocks.filter(function (b) { return b.sig === sig; });
  if (!same.length) return last;
  var titled = same.filter(function (b) { return b.hasTitle; });
  return (titled.length ? titled : same)[(titled.length ? titled : same).length - 1];
}

function locateBlock_(blocks, h, sig, elemento) {
  var byRow = blocks.filter(function (b) { return b.tareaRow === h; })[0];
  if (byRow && (!sig || byRow.sig === sig)) return byRow;
  if (!sig) return byRow || null;
  var cands = blocks.filter(function (b) {
    return b.sig === sig && (elemento == null || key_(b.header.elemento) === key_(elemento));
  });
  if (cands.length === 1) return cands[0];
  if (byRow && cands.indexOf(byRow) >= 0) return byRow;
  // varios candidatos: el más cercano a la fila original
  if (cands.length) {
    cands.sort(function (a, b) { return Math.abs(a.tareaRow - h) - Math.abs(b.tareaRow - h); });
    return cands[0];
  }
  return null;
}

/** Valida que cada offset apunte al mismo criterio; si no, lo busca por texto. */
function resolveItemOffsets_(blk, items, warnings) {
  var byOff = {};
  blk.items.forEach(function (it) { byOff[it.off] = it; });
  var used = {};
  var out = {};
  Object.keys(items || {}).forEach(function (k) {
    var it = items[k];
    var off = Number(k);
    var target = byOff[off];
    if (it.criterio && (!target || key_(target.criterio) !== key_(it.criterio))) {
      var match = blk.items.filter(function (b) {
        return !used[b.off] && key_(b.criterio) === key_(it.criterio) && (!it.tarea || key_(b.tarea) === key_(it.tarea));
      })[0];
      if (!match) {
        warnings.push('No se encontró el criterio "' + it.criterio.slice(0, 60) + '"');
        return;
      }
      target = match;
    }
    if (!target) return;
    used[target.off] = true;
    out[target.off] = it;
  });
  return out;
}

function shiftBlock_(b, d) {
  var mv = function (rc) { return rc ? { r: rc.r + d, c: rc.c } : rc; };
  var cells = {};
  Object.keys(b.header.cells).forEach(function (k) { cells[k] = mv(b.header.cells[k]); });
  return {
    startRow: b.startRow + d,
    tareaRow: b.tareaRow + d,
    endRow: b.endRow + d,
    cols: b.cols,
    header: { respCells: b.header.respCells.map(mv), cells: cells },
    items: b.items.map(function (it) {
      var c = {};
      for (var k in it) c[k] = it[k];
      return c;
    }),
    sig: b.sig
  };
}

function blockGap_(blocks) {
  if (blocks.length < 2) return PIE.DEFAULT_GAP;
  var a = blocks[blocks.length - 2];
  var b = blocks[blocks.length - 1];
  var gap = b.startRow - a.endRow - 1;
  return Math.max(1, Math.min(3, gap));
}

function rubroOf_(sheetName) {
  for (var i = 0; i < PIE.RUBROS.length; i++) {
    if (PIE.RUBROS[i][1].indexOf(String(sheetName)) >= 0) return PIE.RUBROS[i][0];
  }
  return 'Otros';
}

/**
 * Formato compacto para el celular: los criterios se guardan una sola vez
 * por planilla (crit) y cada ítem de registro los referencia por índice.
 * Ítem: [offset, idxCriterio, documento, fecha, resp, estado, fum, obs]
 */
function toClientCategory_(name, parsed, hidden, fotos) {
  var dict = {};
  var crit = [];
  var critIndex = function (it) {
    var k = [it.etapa, it.tarea, it.muestra, it.criterio, it.metodo, it.instrumento].join('\u0001');
    if (!dict.hasOwnProperty(k)) {
      dict[k] = crit.length;
      crit.push([it.etapa, it.tarea, it.muestra === '' ? '' : it.muestra, it.criterio, it.metodo, it.instrumento]);
    }
    return dict[k];
  };
  var regs = parsed.blocks.map(function (b) {
    return {
      h: b.tareaRow,
      s: b.startRow,
      sig: b.sig,
      slots: b.header.respCells.length,
      resp: b.header.responsables,
      piso: b.header.piso,
      sector: b.header.sector,
      etapa: b.header.etapa,
      elemento: b.header.elemento,
      cols: FILL_FIELDS.filter(function (f) { return !!b.cols[f]; }),
      fotos: (fotos || {})[b.tareaRow] || {},
      items: b.items.map(function (it) {
        return [it.off, critIndex(it), it.documento, it.fecha, it.resp, it.estado, it.fum, it.obs];
      })
    };
  });
  return {
    sheet: name,
    titulo: parsed.title || ('Planilla ' + name),
    rubro: rubroOf_(name),
    oculta: !!hidden,
    crit: crit,
    registros: regs
  };
}

function parseDatos_(values) {
  var out = { obra: '', direccion: '', licitacion: '', responsables: [], instrumentos: [], metodos: ['IV', 'ID'], estados: ['AP', 'RZ'] };
  var hdr = null;
  values.forEach(function (row, i) {
    row.forEach(function (v, j) {
      var k = key_(v);
      if (k === 'OBRA:') out.obra = txt_(row[j + 1]);
      if (k === 'DIRECCION:') out.direccion = txt_(row[j + 1]);
      if (k.indexOf('LICITACION') === 0) out.licitacion = txt_(row[j + 1]);
      if (k === 'RESPONSABLE' && hdr === null) hdr = { r: i, resp: j };
      if (hdr && hdr.r === i) {
        if (k.indexOf('ABREV') === 0) hdr.abrev = j;
        if (k.indexOf('INSTRUMENTO') === 0) hdr.instr = j;
      }
    });
  });
  if (hdr) {
    for (var i = hdr.r + 1; i < values.length; i++) {
      var name = txt_(values[i][hdr.resp]);
      if (name) out.responsables.push({ nombre: name, abrev: hdr.abrev != null ? txt_(values[i][hdr.abrev]) : '' });
      var ins = hdr.instr != null ? txt_(values[i][hdr.instr]) : '';
      if (ins && out.instrumentos.indexOf(ins) < 0) out.instrumentos.push(ins);
    }
  }
  return out;
}

/** Orden de revisiones: numéricas por valor; letras (A, B…) antes que los números. */
function revRank_(v) {
  var t = txt_(v).toUpperCase().replace(/^REV\.?\s*|^R/, '');
  if (t === '') return [-1, 0];
  if (/^\d+(\.\d+)?$/.test(t)) return [1, Number(t)];
  return [0, t];
}

function revCompare_(a, b) {
  var x = revRank_(a), y = revRank_(b);
  if (x[0] !== y[0]) return x[0] - y[0];
  return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0;
}

/**
 * FOD 02: devuelve sólo la última revisión de cada código de documento.
 * Doc: [codigo, rev, detalle, categoria, piso, fecha, estado, vigente, emitido, fila]
 */
function parseFod_(values) {
  var hdr = -1, cols = {};
  for (var i = 0; i < Math.min(values.length, 40) && hdr < 0; i++) {
    values[i].forEach(function (v, j) {
      var k = key_(v);
      if (k.indexOf('CODIGO DEL DOCUMENTO') === 0) { hdr = i; cols.codigo = j; }
    });
  }
  if (hdr < 0) return { docs: [], aviso: 'El FOD 02 no tiene la columna "CÓDIGO DEL DOCUMENTO/PLANO"' };
  values[hdr].forEach(function (v, j) {
    var k = key_(v);
    var set = function (f) { if (cols[f] == null) cols[f] = j; };
    if (k.indexOf('REV') >= 0 && k.indexOf('NO') === 0) set('rev');
    else if (k.indexOf('DETALLE') === 0) set('detalle');
    else if (k.indexOf('SUB') === 0) set('sub');
    else if (k.indexOf('CATERGORIA') === 0 || k.indexOf('CATEGORIA') === 0) set('categoria');
    else if (k.indexOf('NIVEL') === 0 || k === 'PISO') set('piso');
    else if (k === 'FECHA') set('fecha');
    else if (k === 'ESTADO') set('estado');
    else if (k === 'VIGENTE') set('vigente');
    else if (k.indexOf('EMITIDO') === 0) set('emitido');
  });
  var g = function (row, f) { return cols[f] == null ? '' : txt_(row[cols[f]]); };
  var best = {};
  var order = [];
  for (var r = hdr + 1; r < values.length; r++) {
    var row = values[r];
    var code = g(row, 'codigo');
    if (!code) continue;
    var k = key_(code);
    var rev = cols.rev == null ? '' : row[cols.rev];
    var cur = best[k];
    if (!cur) order.push(k);
    if (!cur || revCompare_(rev, cur.rev) >= 0) best[k] = { rev: rev, row: row, r: r + 1 };
  }
  var docs = order.map(function (k) {
    var b = best[k];
    return [g(b.row, 'codigo'), txt_(b.rev), g(b.row, 'detalle'), g(b.row, 'categoria') || g(b.row, 'sub'), g(b.row, 'piso'),
      g(b.row, 'fecha'), g(b.row, 'estado'), g(b.row, 'vigente'), g(b.row, 'emitido'), b.r];
  });
  docs.sort(function (a, b) { return a[5] < b[5] ? 1 : a[5] > b[5] ? -1 : b[9] - a[9]; });
  return { docs: docs };
}

if (typeof module !== 'undefined') {
  module.exports = { parseSheet_: parseSheet_, parseDatos_: parseDatos_, toClientCategory_: toClientCategory_, parseFod_: parseFod_ };
}
