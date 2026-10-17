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
 *  - Lleva el registro de FUM (no conformidades) de los controles rechazados
 *    en la hoja "FUM - Rechazos": número correlativo, reinspección y cierre.
 *  - Expone una API JSON (doGet/doPost) y sirve la app (Index.html).
 *
 * Las operaciones llegan en lotes desde la cola offline del celular y son
 * idempotentes: cada una tiene un id que queda registrado en la hoja oculta
 * _PIE_LOG, así un reintento nunca duplica un bloque.
 */

var PIE = {
  VERSION: '1.3.0',
  DATOS_SHEET: 'DATOS',
  LOG_SHEET: '_PIE_LOG',
  FOTOS_SHEET: '_PIE_FOTOS',
  FOD_SHEET: 'FOD-02',   // pestaña del Registro de Control y Distribución de Documentos
  FUM_SHEET: '_PIE_FUM',          // índice interno (oculto) de las FUM abiertas desde la app
  FUM_SHEET_OLD: 'FUM - Rechazos', // nombre de la v1.2, se migra solo
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
// columnas que la app puede escribir (el instrumento se completa con el N° de serie,
// pero no se borra al crear un bloque porque es parte del requisito)
var WRITE_FIELDS = FILL_FIELDS.concat(['instrumento']);

var FUM_HEAD = ['N° FUM', 'Fecha apertura', 'Planilla', 'Categoría', 'Fila PIE', 'Elemento', 'Piso', 'Sector', 'Tarea',
  'Criterio', 'Observación', 'Acción correctiva', 'Reinspección prevista', 'Detectado por', 'Estado', 'Fecha cierre',
  'Cerrado por', 'Resultado / nota', 'fila_tarea', 'offset', 'Acción inmediata', 'Fila FOG 01'];

// valores de las listas del FOG 01
var FOG_ORIGEN = 'Inspección Interna';
var FOG_ACCIONES = ['Reparar', 'Recambio', 'Recalificar', 'Dejar como esta'];

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
    .addItem('Vincular FOG 01 (FUM - formulario de mejoras)', 'vincularFog01')
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
  var actual = PropertiesService.getScriptProperties().getProperty('FOD02_ID');
  var r = ui.prompt('Vincular FOD 02',
    'Pegá el enlace del FOD 02 que está en Google Drive (Hoja de cálculo de Google o el .xlsx subido a Drive).\n' +
    'Dejalo vacío si copiaste la pestaña del FOD 02 dentro de esta planilla.' +
    (actual ? '\n\nVinculado ahora: https://docs.google.com/spreadsheets/d/' + actual : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var res = linkFod_(r.getResponseText());
  ui.alert(res.ok ? 'FOD 02 vinculado' : 'No se pudo vincular el FOD 02', res.msg, ui.ButtonSet.OK);
}

/** Valida y guarda el vínculo al FOD 02. Devuelve {ok, msg} con un diagnóstico legible. */
function linkFod_(text) {
  var props = PropertiesService.getScriptProperties();
  var v = String(text || '').trim();
  try {
    if (!v) {
      var own = fodSheet_(SpreadsheetApp.getActiveSpreadsheet());
      var docsOwn = parseFod_(readValues_(own)).docs;
      props.deleteProperty('FOD02_ID');
      props.setProperty('FOD02_SHEET', own.getName());
      return { ok: true, msg: 'Se usa la pestaña "' + own.getName() + '" de esta planilla: ' + docsOwn.length + ' documentos (última revisión de cada código).' };
    }
    if (/sharepoint\.com|onedrive|1drv\.ms|office\.com|live\.com/i.test(v)) {
      return { ok: false, msg: 'Ese enlace es de SharePoint/OneDrive y Apps Script sólo puede leer archivos de Google Drive.\n\n' +
        'Descargá el FOD 02 desde SharePoint, subilo a tu Google Drive (Nuevo › Subir archivo) y pegá el enlace del archivo de Drive ' +
        '(clic derecho › Compartir › Copiar vínculo).' };
    }
    var id = extractDriveId_(v);
    if (!id) return { ok: false, msg: 'No reconozco ese enlace. Tiene que ser algo como https://docs.google.com/spreadsheets/d/…/edit o https://drive.google.com/file/d/…/view' };
    var book = openFodBook_(id);
    var sh = fodSheet_(book);
    var docs = parseFod_(readValues_(sh)).docs;
    if (!docs.length) return { ok: false, msg: 'Abrí "' + book.getName() + '" (pestaña "' + sh.getName() + '") pero no encontré documentos debajo de la columna CÓDIGO DEL DOCUMENTO/PLANO.' };
    props.setProperty('FOD02_ID', id);
    props.deleteProperty('FOD02_SHEET');
    return { ok: true, msg: 'Archivo: ' + book.getName() + '\nPestaña: ' + sh.getName() + '\nDocumentos: ' + docs.length + ' (última revisión de cada código).\n\n' +
      'En el celular: Ajustes › Sincronizar y descargar todo.' };
  } catch (err) {
    return { ok: false, msg: String(err.message || err) };
  }
}

function extractDriveId_(v) {
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(v) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(v);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(v) ? v : '';
}

/**
 * Abre el FOD 02 por id. Si es un .xlsx subido a Drive lo convierte a Hoja de
 * cálculo de Google (servicio avanzado Drive) y reutiliza la copia mientras el
 * Excel no cambie; cuando lo reemplazan por una versión nueva, lo vuelve a convertir.
 */
function openFodBook_(id) {
  // Hoja de cálculo de Google: se abre directo (sólo usa el permiso de planillas).
  var firstErr;
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    firstErr = e;
  }
  // Si no es una planilla de Google, ver si es un Excel en Drive.
  var file;
  try {
    file = DriveApp.getFileById(id);
  } catch (e) {
    var msg = String(e && e.message || e);
    if (/permiso|permission|autoriz|authoriz/i.test(msg)) {
      throw pieError_('Falta autorizar el acceso a Google Drive. En el editor de Apps Script elegí la función "autorizar" ' +
        'en la barra de arriba, tocá Ejecutar y aceptá los permisos. Después volvé a vincular.\n\nDetalle: ' + msg, 'config');
    }
    throw pieError_('No pude abrir el archivo de ese enlace. Verificá que la cuenta dueña del script lo pueda abrir.\n\n' +
      'Detalle: ' + String(firstErr && firstErr.message || firstErr) + ' / ' + msg, 'config');
  }
  var mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(id);
  if (mime === MimeType.MICROSOFT_EXCEL || mime === MimeType.MICROSOFT_EXCEL_LEGACY) return convertedCopy_(file);
  throw pieError_('El enlace es de "' + file.getName() + '" (' + mime + '), que no es una planilla.', 'config');
}

function convertedCopy_(file) {
  if (typeof Drive === 'undefined') {
    throw pieError_('"' + file.getName() + '" es un Excel (.xlsx) sin convertir. Opción 1: abrilo en Drive y usá Archivo › Guardar como Hojas de cálculo de Google, ' +
      'y pegá el enlace del archivo nuevo. Opción 2: pegá de nuevo el appsscript.json actualizado (activa el servicio Drive) para que el script lo convierta solo.', 'config');
  }
  var props = PropertiesService.getScriptProperties();
  var stamp = file.getId() + '@' + file.getLastUpdated().getTime();
  var cached = (props.getProperty('FOD02_CONV') || '').split('|');
  if (cached[0] === stamp && cached[1]) {
    try { return SpreadsheetApp.openById(cached[1]); } catch (e) { /* la copia se borró: se vuelve a convertir */ }
  } else if (cached[1]) {
    try { DriveApp.getFileById(cached[1]).setTrashed(true); } catch (e) { /* ya no existe */ }
  }
  var conv = Drive.Files.create({ name: file.getName().replace(/\.xlsx?$/i, '') + ' (copia para app PIE)', mimeType: MimeType.GOOGLE_SHEETS }, file.getBlob());
  props.setProperty('FOD02_CONV', stamp + '|' + conv.id);
  return SpreadsheetApp.openById(conv.id);
}

/**
 * Ejecutar una vez desde el editor (Ejecutar ▶) para que Google pida todos los
 * permisos del script: planillas, Drive (fotos y FOD 02 en Excel) y menús.
 */
function autorizar() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
  // prueba de escritura: es lo que necesitan las fotos
  var tmp = DriveApp.getRootFolder().createFolder('PIE - prueba de permisos');
  tmp.setTrashed(true);
  try { SpreadsheetApp.getUi().alert('Permisos OK (planillas y Google Drive). Ahora publicá una nueva versión: Implementar › Administrar implementaciones › ✏️ › Nueva versión.'); } catch (e) { Logger.log('Permisos OK'); }
}

function vincularFog01() {
  var ui = SpreadsheetApp.getUi();
  var actual = PropertiesService.getScriptProperties().getProperty('FOG01_ID');
  var r = ui.prompt('Vincular FOG 01',
    'Pegá el enlace del FOG 01 (Formulario Único de Mejoras) convertido a Hoja de cálculo de Google.\n' +
    'Las FUM de los controles rechazados se van a registrar ahí, con su número correlativo.\n' +
    'Escribí "quitar" para dejar de usarlo.' +
    (actual ? '\n\nVinculado ahora: https://docs.google.com/spreadsheets/d/' + actual : ''), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var res = linkFog_(r.getResponseText());
  ui.alert(res.ok ? 'FOG 01 vinculado' : 'No se pudo vincular el FOG 01', res.msg, ui.ButtonSet.OK);
}

function linkFog_(text) {
  var props = PropertiesService.getScriptProperties();
  var v = String(text || '').trim();
  if (/^quitar$/i.test(v)) { props.deleteProperty('FOG01_ID'); return { ok: true, msg: 'Se dejó de usar el FOG 01.' }; }
  if (/sharepoint\.com|onedrive|1drv\.ms|office\.com|live\.com/i.test(v)) {
    return { ok: false, msg: 'Ese enlace es de SharePoint/OneDrive. Subí el FOG 01 a Google Drive, convertilo (Archivo › Guardar como Hojas de cálculo de Google) y pegá ese enlace.' };
  }
  var id = extractDriveId_(v);
  if (!id) return { ok: false, msg: 'No reconozco ese enlace. Tiene que ser https://docs.google.com/spreadsheets/d/…/edit' };
  try {
    var book;
    try { book = SpreadsheetApp.openById(id); } catch (e) {
      throw pieError_('No pude abrirlo como Hoja de cálculo de Google. Si es el .xlsx, convertilo primero (Archivo › Guardar como Hojas de cálculo de Google). Detalle: ' + e.message, 'config');
    }
    var fog = fogInfo_(book);
    props.setProperty('FOG01_ID', id);
    return { ok: true, msg: 'Archivo: ' + book.getName() + '\nPestaña: ' + fog.sh.getName() + '\nÚltima FUM cargada: N° ' + fog.maxNum +
      '\nLa próxima que se abra desde la app será la N° ' + (fog.maxNum + 1) + '.' };
  } catch (err) {
    return { ok: false, msg: String(err.message || err) };
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
    fums: readFums_(ss),
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
          results.push({ id: op.id, ok: true, dup: true, sheet: prev.sheet, h: prev.h, url: prev.url,
            fum: op.op === 'fum' && prev.url ? Number(prev.url) : undefined });
          if (prev.sheet && ss.getSheetByName(prev.sheet)) touched[prev.sheet] = true;
          return;
        }
        var res;
        if (op.op === 'create') res = opCreate_(ss, op);
        else if (op.op === 'update') res = opUpdate_(ss, log, op);
        else if (op.op === 'photo') res = opPhoto_(ss, log, op);
        else if (op.op === 'fum') res = opFum_(ss, log, op);
        else throw pieError_('Operación desconocida: ' + op.op, 'bad_request');
        var extra = res.url || (res.fum != null ? String(res.fum) : '');
        var sheetName = res.sheet || op.sheet;
        log.appendRow([op.id, new Date(), op.op, sheetName, res.h, op.by || '', res.warnings ? res.warnings.join(' | ') : '', extra]);
        if (sheetName && ss.getSheetByName(sheetName)) touched[sheetName] = true;
        results.push({ id: op.id, ok: true, sheet: sheetName, h: res.h, url: res.url, fum: res.fum, warnings: res.warnings || [] });
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
  return { ok: true, results: results, categorias: cats, fums: readFums_(ss) };
}

/* ------------------------------------------------------------------ */
/*  Lectura                                                             */
/* ------------------------------------------------------------------ */

function isCategorySheet_(name) {
  return name !== PIE.DATOS_SHEET && name !== PIE.FOD_SHEET && name !== PIE.FUM_SHEET_OLD && name.charAt(0) !== '_' &&
    !/^F\.?U\.?M\b/i.test(name);
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
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOD02_ID');
  try {
    if (id) return parseFod_(readValues_(fodSheet_(openFodBook_(id))));
    var own = ss.getSheetByName(props.getProperty('FOD02_SHEET') || PIE.FOD_SHEET);
    if (!own) return { docs: [], aviso: 'FOD 02 sin vincular (en la planilla: menú PIE › Vincular FOD 02)' };
    return parseFod_(readValues_(own));
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
  var file;
  try {
    file = photoFolder_(ss, op.sheet, found.title).createFile(blob);
  } catch (err) {
    if (/permiso|permission|autoriz|authoriz/i.test(String(err.message))) {
      throw pieError_('Falta el permiso de Google Drive para guardar fotos. En Apps Script elegí la función "autorizar", tocá Ejecutar y aceptá; ' +
        'después Implementar › Administrar implementaciones › ✏️ › Nueva versión. Luego tocá Reintentar.', 'auth_drive');
    }
    throw err;
  }
  file.setDescription('PIE planilla ' + op.sheet + ' fila ' + row + ' · ' + (item.criterio || '') + ' · ' + (op.by || ''));
  var url = file.getUrl();
  var cell = sh.getRange(row, blk.cols.obs || blk.cols.estado || blk.cols.criterio);
  var note = cell.getNote();
  cell.setNote((note ? note + '\n' : '') + 'Foto ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yy') + ': ' + url);
  fotosSheet_(ss).appendRow([new Date(), op.sheet, blk.tareaRow, off, row, item.criterio || '', blk.header.elemento || '', op.by || '', file.getId(), url]);
  return { h: blk.tareaRow, url: url, warnings: warnings };
}

/* ---------- FUM: no conformidades de controles rechazados ---------- */
/*
 * Cada FUM queda en dos lugares:
 *  - el FOG 01 (Formulario Único de Mejoras), si está vinculado: una fila nueva
 *    con el formato de las anteriores, numeración correlativa del FOG;
 *  - el índice oculto _PIE_FUM de esta planilla, que guarda a qué control del
 *    PIE corresponde cada número (el FOG no tiene dónde anotarlo).
 */

function fumSheet_(ss) {
  var sh = ss.getSheetByName(PIE.FUM_SHEET);
  if (!sh) {
    sh = ss.getSheetByName(PIE.FUM_SHEET_OLD);   // migración de la v1.2
    if (sh) sh.setName(PIE.FUM_SHEET);
    else { sh = ss.insertSheet(PIE.FUM_SHEET); sh.appendRow(FUM_HEAD); }
    sh.getRange(1, 1, 1, FUM_HEAD.length).setValues([FUM_HEAD]);
    sh.hideSheet();
  }
  return sh;
}

/** Datos del FOG 01 vinculado: hoja, columnas por rótulo, fila de encabezado, leyenda y último N°. */
function fogInfo_(book) {
  var sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var lr = Math.max(1, sh.getLastRow()), lc = Math.max(1, sh.getLastColumn());
    var head = sh.getRange(1, 1, Math.min(lr, 30), Math.min(lc, 60)).getValues();
    var hr = -1;
    head.forEach(function (row, r) { row.forEach(function (v) { if (hr < 0 && key_(v).indexOf('DESCRIPCION DEL DESVIO') === 0) hr = r; }); });
    if (hr < 0) continue;
    var cols = {};
    var set = function (f, c) { if (!cols[f]) cols[f] = c + 1; };
    // rótulos de la fila de encabezado y la anterior (N°, Cliente, Obra, N C, A C)
    [hr - 1, hr, hr + 1].forEach(function (r) {
      if (r < 0 || r >= head.length) return;
      head[r].forEach(function (v, c) {
        var k = key_(v);
        if (k === 'N°' || k === 'NO' || k === 'N') set('num', c);
        else if (k.indexOf('CLIENTE') === 0) set('cliente', c);
        else if (k === 'OBRA') set('obra', c);
        else if (k === 'N C') set('nc', c);
        else if (k === 'A C') set('ac', c);
        else if (k.indexOf('ORIGEN DEL DESVIO') === 0) set('origen', c);
        else if (k.indexOf('PROCESOS INVOLUCRADOS') === 0 || k === 'INTERNOS') set('procesos', c);
        else if (k === 'PROVEEDOR') set('proveedor', c);
        else if (k.indexOf('DESCRIPCION DEL DESVIO') === 0) set('desc', c);
        else if (k.indexOf('QUIEN REGISTRO') === 0) set('quien', c);
        else if (k === 'ACCION INMEDIATA') set('accionInm', c);
        else if (k.indexOf('DESCRIPCION DE LA ACCION INMEDIATA') === 0) set('descAccion', c);
        else if (k.indexOf('CIERRE DE LA ACCION INMEDIATA') === 0) set('cierre', c);
      });
    });
    // columnas que se repiten: la primera después de su referencia
    var after = function (label, ref) {
      for (var c = (cols[ref] || 1); c < head[hr].length; c++) if (key_(head[hr][c]).indexOf(label) === 0) return c + 1;
      return null;
    };
    cols.fecha = after('FECHA', 'origen');
    cols.plazo = after('PLAZO', 'descAccion');
    cols.resp = after('RESPONSABLE', 'descAccion');
    cols.fechaCierre = after('FECHA', 'cierre');
    if (!cols.num || !cols.desc) throw pieError_('El FOG 01 no tiene las columnas N° y Descripción del Desvío', 'config');
    var values = sh.getRange(1, 1, lr, Math.min(lc, 60)).getValues();
    var legend = 0, last = hr + 1, maxNum = 0;
    for (var r = hr + 1; r < values.length; r++) {
      var row = values[r];
      if (cols.origen && key_(row[cols.origen - 1]) === 'ORIGEN') { legend = r + 1; break; }
      var n = Number(row[cols.num - 1]);
      if (row[cols.num - 1] !== '' && !isNaN(n) && n > maxNum) maxNum = n;
      if (txt_(row[cols.num - 1]) !== '' || txt_(row[cols.desc - 1]) !== '') last = r + 1;
    }
    return { book: book, sh: sh, cols: cols, headerEnd: hr + 2, legend: legend, last: last, maxNum: maxNum, values: values };
  }
  throw pieError_('No encontré en ese archivo la planilla del FOG 01 (columna "Descripción del Desvío")', 'config');
}

function fogLinked_() {
  var id = PropertiesService.getScriptProperties().getProperty('FOG01_ID');
  return id ? fogInfo_(SpreadsheetApp.openById(id)) : null;
}

/** Agrega la FUM al FOG 01 con el formato de la fila anterior. Devuelve el N° de fila. */
function fogAppend_(fog, d) {
  var sh = fog.sh, c = fog.cols;
  var width = sh.getLastColumn();
  var target = fog.last + 1;
  // dejar al menos una fila libre antes de la leyenda (ORIGEN / ACCION INMEDIATA)
  if (fog.legend && target > fog.legend - 2) {
    sh.insertRowAfter(fog.last);
  }
  if (fog.last >= fog.headerEnd) {
    var src = sh.getRange(fog.last, 1, 1, width);
    var dst = sh.getRange(target, 1, 1, width);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    sh.setRowHeight(target, sh.getRowHeight(fog.last));
  }
  var prev = fog.last >= fog.headerEnd ? fog.values[fog.last - 1] : [];
  var put = function (key, v) { if (c[key]) sh.getRange(target, c[key]).setValue(v); };
  withoutValidation_(sh, target, target, function () {
    put('num', d.num);
    put('cliente', prev[c.cliente - 1] || '');
    put('obra', prev[c.obra - 1] || d.obra || '');
    put('nc', 1);
    put('ac', 1);
    put('origen', FOG_ORIGEN);
    put('procesos', 'Producción');
    put('proveedor', 'NA');
    put('fecha', d.fecha);
    put('desc', d.desc);
    put('quien', d.quien);
    put('accionInm', d.accionInm);
    put('descAccion', d.descAccion);
    put('plazo', d.plazoDias === '' ? '' : d.plazoDias);
    put('resp', d.quien);
  }, width);
  return target;
}

/** Busca la fila del FOG con ese N° (primero en la fila guardada, si no por número). */
function fogRowOf_(fog, num, hint) {
  var c = fog.cols.num;
  if (hint && Number(fog.values[hint - 1] && fog.values[hint - 1][c - 1]) === Number(num)) return hint;
  for (var r = fog.values.length; r > fog.headerEnd - 1; r--) {
    if (Number(fog.values[r - 1][c - 1]) === Number(num)) return r;
  }
  return 0;
}

/** [num, planilla, filaTarea, offset, apertura, estado, plazo, accion, elemento, criterio, obs, cierre, resultado, detectado, piso, accionInmediata] */
function readFums_(ss) {
  var sh = ss.getSheetByName(PIE.FUM_SHEET) || ss.getSheetByName(PIE.FUM_SHEET_OLD);
  if (!sh || sh.getLastRow() < 2) return [];
  var fog = null;
  try { fog = fogLinked_(); } catch (e) { fog = null; }
  return readValues_(sh).slice(1).filter(function (r) { return r[0] !== '' && r[0] != null; }).map(function (r) {
    var f = [Number(r[0]), String(r[2]), Number(r[18]), Number(r[19]), txt_(r[1]), txt_(r[14]), txt_(r[12]), txt_(r[11]),
      txt_(r[5]), txt_(r[9]), txt_(r[10]), txt_(r[15]), txt_(r[17]), txt_(r[13]), txt_(r[6]), txt_(r[20])];
    // si la acción inmediata se cerró a mano en el FOG 01, se refleja en la app
    if (fog && f[5] === 'Abierta' && fog.cols.fechaCierre) {
      var fr = fogRowOf_(fog, f[0], Number(r[21]) || 0);
      var cierre = fr ? fog.values[fr - 1][fog.cols.fechaCierre - 1] : '';
      if (cierre) {
        f[5] = 'Cerrada';
        f[11] = Object.prototype.toString.call(cierre) === '[object Date]' ? Utilities.formatDate(cierre, Session.getScriptTimeZone(), 'yyyy-MM-dd') : txt_(cierre);
        f[12] = txt_(fog.values[fr - 1][(fog.cols.cierre || 1) - 1]) || 'Cerrada en el FOG 01';
      }
    }
    return f;
  });
}

function fumRow_(sh, num) {
  if (sh.getLastRow() < 2) return 0;
  var hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(String(num)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

function nextFumNumber_(sh, fog) {
  var max = fog ? fog.maxNum : 0;
  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var n = Number(r[0]);
      if (n > max) max = n;
    });
  }
  var inicio = Number(PropertiesService.getScriptProperties().getProperty('FUM_INICIO') || 1);
  return Math.max(max + 1, inicio);
}

function daysBetween_(a, b) {
  var m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || ''), m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '');
  if (!m1 || !m2) return '';
  return Math.round((Date.UTC(+m2[1], m2[2] - 1, +m2[3]) - Date.UTC(+m1[1], m1[2] - 1, +m1[3])) / 86400000);
}

function opFum_(ss, log, op) {
  var fsh = fumSheet_(ss);
  var tz = Session.getScriptTimeZone();
  var hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var fog = fogLinked_();   // si está vinculado y no abre, que falle y se reintente
  var warnings = [];
  var accionInm = FOG_ACCIONES.indexOf(op.accionInmediata) >= 0 ? op.accionInmediata : 'Reparar';
  if (op.accion === 'abrir') {
    var sh = sheetOrThrow_(ss, op.sheet);
    var found = resolveBlock_(sh, log, op);
    var blk = found.blk;
    var req = {};
    req[op.off] = { criterio: op.criterio, tarea: op.tarea };
    var offs = Object.keys(resolveItemOffsets_(blk, req, warnings));
    if (!offs.length) throw pieError_('No se encontró el control rechazado en la planilla', 'conflict');
    var off = Number(offs[0]);
    var item = blk.items.filter(function (it) { return it.off === off; })[0] || {};
    // si ya hay una FUM abierta para ese control, se reutiliza
    var open = readFums_(ss).filter(function (f) {
      return f[1] === String(op.sheet) && f[2] === blk.tareaRow && f[3] === off && f[5] === 'Abierta';
    })[0];
    if (open) return { h: blk.tareaRow, fum: open[0], warnings: ['Ya existía la FUM ' + open[0]] };
    var num = nextFumNumber_(fsh, fog);
    var hd = blk.header;
    var obs = op.obs || item.obs || '';
    var desc = 'Control PIE (FOP 01) rechazado – Planilla ' + op.sheet + ' ' + found.title + ' – ' + (hd.elemento || 'sin elemento') +
      (hd.piso ? ' – Piso ' + hd.piso : '') + (hd.sector ? ' – ' + hd.sector : '') + ' – ' + (item.tarea ? item.tarea + ': ' : '') +
      '"' + (item.criterio || '') + '"' + (obs ? '. Obs.: ' + obs : '') + ' (fila ' + (blk.tareaRow + off) + ' del PIE).';
    var fogRow = '';
    if (fog) {
      fogRow = fogAppend_(fog, {
        num: num, fecha: toCellValue_('fecha', hoy), desc: desc, quien: op.by || '', accionInm: accionInm,
        descAccion: op.accionCorrectiva || '', plazoDias: daysBetween_(hoy, op.plazo), obra: ''
      });
    }
    fsh.appendRow([num, new Date(), String(op.sheet), found.title, blk.tareaRow + off, hd.elemento || '',
      hd.piso || '', hd.sector || '', item.tarea || '', item.criterio || '', obs,
      op.accionCorrectiva || '', toCellValue_('fecha', op.plazo || ''), op.by || '', 'Abierta', '', '', '', blk.tareaRow, off, accionInm, fogRow]);
    var w = {};
    w[off] = { criterio: item.criterio, fum: String(num) };
    withoutValidation_(sh, blk.startRow, blk.endRow, function () { writeItems_(sh, blk, w, false); });
    return { h: blk.tareaRow, fum: num, warnings: warnings };
  }
  var n = op.num;
  if (!n && op.ref) {
    var created = findLog_(log, op.ref);
    if (!created || !created.url) throw pieError_('La FUM todavía no fue creada', 'retry');
    n = Number(created.url);
  }
  var row = fumRow_(fsh, n);
  if (!row) throw pieError_('No se encontró la FUM ' + n, 'conflict');
  var col = function (name) { return FUM_HEAD.indexOf(name) + 1; };
  var idx = fsh.getRange(row, 1, 1, FUM_HEAD.length).getValues()[0];
  var fr = fog ? fogRowOf_(fog, n, Number(idx[col('Fila FOG 01') - 1]) || 0) : 0;
  var fput = function (key, v) { if (fr && fog.cols[key]) fog.sh.getRange(fr, fog.cols[key]).setValue(v); };
  if (op.accion === 'cerrar') {
    var fecha = op.fecha || hoy;
    var anulada = op.resultado === 'Anulada';
    fsh.getRange(row, col('Estado')).setValue(anulada ? 'Anulada' : 'Cerrada');
    fsh.getRange(row, col('Fecha cierre')).setValue(toCellValue_('fecha', fecha));
    fsh.getRange(row, col('Cerrado por')).setValue(op.by || '');
    fsh.getRange(row, col('Resultado / nota')).setValue(op.resultado || '');
    if (fr) withoutValidation_(fog.sh, fr, fr, function () {
      fput('cierre', anulada ? 'Anulada desde la app PIE (' + (op.by || '') + ')' :
        'Reinspección aprobada en el PIE (' + (op.resultado || 'AP') + ', ' + (op.by || '') + ')');
      fput('fechaCierre', toCellValue_('fecha', fecha));
    }, fog.sh.getLastColumn());
  } else if (op.accion === 'editar') {
    var apertura = Object.prototype.toString.call(idx[1]) === '[object Date]' ? Utilities.formatDate(idx[1], tz, 'yyyy-MM-dd') : txt_(idx[1]);
    if (op.hasOwnProperty('accionCorrectiva')) fsh.getRange(row, col('Acción correctiva')).setValue(op.accionCorrectiva || '');
    if (op.hasOwnProperty('plazo')) fsh.getRange(row, col('Reinspección prevista')).setValue(toCellValue_('fecha', op.plazo || ''));
    if (op.hasOwnProperty('obs')) fsh.getRange(row, col('Observación')).setValue(op.obs || '');
    if (op.hasOwnProperty('accionInmediata')) fsh.getRange(row, col('Acción inmediata')).setValue(accionInm);
    if (fr) withoutValidation_(fog.sh, fr, fr, function () {
      if (op.hasOwnProperty('accionCorrectiva')) fput('descAccion', op.accionCorrectiva || '');
      if (op.hasOwnProperty('plazo')) fput('plazo', daysBetween_(apertura, op.plazo));
      if (op.hasOwnProperty('accionInmediata')) fput('accionInm', accionInm);
    }, fog.sh.getLastColumn());
  } else {
    throw pieError_('Acción de FUM desconocida: ' + op.accion, 'bad_request');
  }
  return { h: Number(idx[col('fila_tarea') - 1]), fum: n, sheet: String(idx[col('Planilla') - 1]) };
}

/**
 * Las planillas traen validaciones en modo "rechazar" con listas cortas
 * (ESTADO sólo admite DATOS!J15 = "AP"; RESPONSABLE sólo 3 nombres), lo que
 * hacía fallar la carga con "los datos de la celda X infringen las reglas de
 * validación". Se quitan mientras escribe el script y se restauran tal cual.
 */
function withoutValidation_(sh, r0, r1, fn, ncols) {
  var rng = sh.getRange(r0, 1, r1 - r0 + 1, Math.min(sh.getMaxColumns(), ncols || PIE.MAX_COLS));
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
  var cols = WRITE_FIELDS.map(function (f) { return blk.cols[f]; }).filter(function (c) { return c; });
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
    WRITE_FIELDS.forEach(function (f) {
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
 * Doc: [codigo, rev, detalle, categoria, piso, fecha, estado, vigente, emitido, fila, historial[[rev, fecha]]]
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
  var hist = {};
  var order = [];
  for (var r = hdr + 1; r < values.length; r++) {
    var row = values[r];
    var code = g(row, 'codigo');
    if (!code) continue;
    var k = key_(code);
    var rev = cols.rev == null ? '' : row[cols.rev];
    var cur = best[k];
    if (!cur) { order.push(k); hist[k] = {}; }
    if (!cur || revCompare_(rev, cur.rev) >= 0) best[k] = { rev: rev, row: row, r: r + 1 };
    // fecha en que se recibió cada revisión (la primera vez que aparece)
    var rk = txt_(rev);
    var f = g(row, 'fecha');
    if (!hist[k].hasOwnProperty(rk) || (f && (!hist[k][rk] || f < hist[k][rk]))) hist[k][rk] = f;
  }
  var docs = order.map(function (k) {
    var b = best[k];
    return [g(b.row, 'codigo'), txt_(b.rev), g(b.row, 'detalle'), g(b.row, 'categoria') || g(b.row, 'sub'), g(b.row, 'piso'),
      g(b.row, 'fecha'), g(b.row, 'estado'), g(b.row, 'vigente'), g(b.row, 'emitido'), b.r,
      Object.keys(hist[k]).sort(revCompare_).map(function (rv) { return [rv, hist[k][rv]]; })];
  });
  docs.sort(function (a, b) { return a[5] < b[5] ? 1 : a[5] > b[5] ? -1 : b[9] - a[9]; });
  return { docs: docs };
}

if (typeof module !== 'undefined') {
  module.exports = { parseSheet_: parseSheet_, parseDatos_: parseDatos_, toClientCategory_: toClientCategory_, parseFod_: parseFod_ };
}
