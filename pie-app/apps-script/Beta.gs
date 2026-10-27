/** Reglas de integridad de la beta; no requieren nuevas columnas en las hojas. */
function betaDate_(v) {
  var s = isoDate_(v), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return '';
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === s ? s : '';
}

function betaSerial_(s) { return key_(s).replace(/[^A-Z0-9]/g, ''); }

/** Valida los datos persistidos (nunca el resumen enviado por el dispositivo) con las mismas reglas que la app. */
function betaCheckRelease_(ss, blk, op) {
  var etapa = txt_(op.etapa);
  var items = blk.items.filter(function (it) { return (it.etapa || '—') === etapa; });
  var hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fod = readFodSafe_(ss);
  var r = RL.check(items, { hoy: hoy, sheet: op.sheet, h: blk.tareaRow, docs: fod.docs || [], fodOk: !fod.aviso,
    equipos: readEquipos_(ss), fums: readFums_(ss) });
  var errors = r.errores.map(function (e) { return e.txt; });
  if (!txt_(op.by)) errors.unshift('Falta el responsable de la liberación');
  if (!items.length) errors.unshift('La etapa no existe o no tiene controles');
  if (errors.length) throw pieError_('No se puede liberar. ' + errors.slice(0, 8).join(' · ') +
    (errors.length > 8 ? ' · Hay ' + (errors.length - 8) + ' más para revisar.' : ''), 'release_blocked');
  return { resumen: r.total + ' controles: ' + r.ap + ' AP · ' + r.na + ' N/A', avisos: r.avisos.map(function (e) { return e.txt; }),
    hoy: hoy, ultima: r.ultima };
}

/* <reglas-liberacion> Mismo texto en Beta.gs y en la app (lo comprueba tests/reglas.test.mjs): la pantalla
 * muestra exactamente lo que el servidor va a aceptar o rechazar al liberar una etapa. */
var RL = (function () {
  var ACC = { 'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U', 'Ñ': 'N' };
  function t(v) { return v == null ? '' : String(v).trim(); }
  function k(v) { return t(v).toUpperCase().replace(/[ÁÉÍÓÚÜÑ]/g, function (c) { return ACC[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function valid(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toISOString().slice(0, 10) === s ? s : '';
  }
  /** Fecha de la planilla (aaaa-mm-dd, dd/mm/aa o dd/mm/aaaa) como aaaa-mm-dd; '' si no es una fecha real. */
  function iso(v) {
    var s = t(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return valid(s);
    var m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})$/.exec(s);
    return m ? valid((m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1])) : '';
  }
  function ser(s) { return k(s).replace(/[^A-Z0-9]/g, ''); }
  function code(s) { return k(s).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  /** «-», «S/N» o vacío en la columna de revisión del FOD 02: el documento no tiene revisión. */
  function noRev(r) { return /^(|-+|S\/?N|S\/?R)$/i.test(t(r)); }
  function revKey(v) {
    var s = k(v).replace(/^0+(?=\d)/, '');
    return /^\d+$/.test(s) ? [1, Number(s)] : [0, s];
  }
  function revCmp(a, b) {
    var x = revKey(a), y = revKey(b);
    if (x[0] !== y[0]) return x[0] - y[0];
    return x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0;
  }
  function revLabel(r) { var s = t(r); return /^\d$/.test(s) ? 'R0' + s : 'R' + s; }
  /** Revisión escrita al final de un texto ya normalizado («-R07», «-REV-7», «_07», «-A»). */
  function revAt(rest) {
    var m = /^-(?:REV-?|R)?([0-9]{1,3}|[A-Z])(?=-|$)/.exec(rest);
    return m ? m[1] : null;
  }
  /**
   * Documento del FOD 02 citado en un texto: {doc, rev (escrita o null)} | {ambiguo: true} | null.
   * Primero por código exacto (respetando «_» y «.», que distinguen códigos reales), después normalizado.
   */
  function findDoc(part, docs) {
    var raw = k(part);
    var exact = docs.filter(function (d) {
      var c = k(d[0]);
      return c && (raw === c || (raw.indexOf(c) === 0 && /^[\s\-_.]/.test(raw.charAt(c.length))));
    }).sort(function (a, b) { return k(b[0]).length - k(a[0]).length; });
    if (exact.length && (exact.length === 1 || k(exact[0][0]).length > k(exact[1][0]).length)) {
      return { doc: exact[0], rev: revAt(code(raw.slice(k(exact[0][0]).length)) ? '-' + code(raw.slice(k(exact[0][0]).length)) : '') };
    }
    var n = code(part);
    if (!n) return null;
    var hits = docs.filter(function (d) { var c = code(d[0]); return c && (n === c || n.indexOf(c + '-') === 0); })
      .sort(function (a, b) { return code(b[0]).length - code(a[0]).length; });
    if (!hits.length) return null;
    if (hits.filter(function (d) { return code(d[0]) === code(hits[0][0]); }).length > 1) return { ambiguo: true };
    return { doc: hits[0], rev: revAt(n.slice(code(hits[0][0]).length)) };
  }

  /**
   * Revisa los controles de una etapa. ctx = {hoy, sheet, h, docs (FOD 02), fodOk, equipos, fums,
   * fumAbierta(it) opcional}. Devuelve {errores: [{off, cat, txt}], avisos: [...], ap, na, total, ultima}.
   * cat: pend, rz, fum, fecha, resp, serie, cal, plano. Los avisos no impiden liberar: quedan anotados.
   */
  function check(items, ctx) {
    var errores = [], avisos = [], ap = 0, na = 0, ultima = '';
    var err = function (it, cat, txt) { errores.push({ off: it.off, cat: cat, txt: 'Control ' + it.off + ': ' + txt }); };
    var avi = function (it, txt) { avisos.push({ off: it.off, cat: 'aviso', txt: 'Control ' + it.off + ': ' + txt }); };
    items.forEach(function (it) {
      var est = k(it.estado);
      var fumTxt = /^(NA|N\/A|-+)$/i.test(t(it.fum)) ? '' : t(it.fum);
      var rel = (ctx.fums || []).filter(function (f) {
        return (String(f[1]) === String(ctx.sheet) && Number(f[2]) === Number(ctx.h) && Number(f[3]) === Number(it.off)) ||
          (fumTxt && String(f[0]) === fumTxt);
      });
      if (rel.some(function (f) { return k(f[5]) === 'ABIERTA'; }) || (ctx.fumAbierta && ctx.fumAbierta(it))) err(it, 'fum', 'tiene una FUM abierta');
      else if (fumTxt && !rel.length) avi(it, 'la FUM ' + fumTxt + ' no figura en el índice de FUM');
      var isNA = est !== 'AP' && est !== 'RZ' && (est === 'NA' || est === 'N/A' || /^(NA|N\/A)$/i.test(t(it.fecha)));
      if (isNA) { na++; return; }
      if (est === 'RZ') { err(it, 'rz', 'está en RZ (falta la reinspección)'); return; }
      if (est !== 'AP') { err(it, 'pend', 'está pendiente'); return; }
      ap++;
      var fecha = iso(it.fecha);
      if (!fecha || fecha > ctx.hoy) err(it, 'fecha', 'AP sin fecha válida' + (t(it.fecha) ? ' («' + t(it.fecha) + '»)' : ''));
      else if (fecha > ultima) ultima = fecha;
      if (!t(it.resp)) err(it, 'resp', 'AP sin responsable');
      var instr = t(it.instrumento);
      if (/INDIQUE/i.test(instr)) err(it, 'serie', 'falta el N° de serie del instrumento');
      var re = /\(([^)]+)\)/g, m;
      while ((m = re.exec(instr))) {
        var s = ser(m[1]);
        if (!s || /INDIQUE/i.test(m[1])) continue;
        var eqs = (ctx.equipos || []).filter(function (e) { return ser(e.serie) === s; });
        var nombres = {};
        eqs.forEach(function (e) { nombres[k(e.equipo)] = 1; });
        if (!eqs.length) { err(it, 'cal', 'el equipo N° ' + t(m[1]) + ' no está en EQUIPOS DE MEDICIÓN'); continue; }
        if (Object.keys(nombres).length > 1) { err(it, 'cal', 'el N° ' + t(m[1]) + ' figura para dos equipos distintos en EQUIPOS DE MEDICIÓN'); continue; }
        // si se recalibró y se agregó otra fila con la misma serie, vale el vencimiento más lejano
        var vence = eqs.map(function (e) { return iso(e.vence); }).sort().pop();
        if (!vence) err(it, 'cal', 'el equipo N° ' + t(m[1]) + ' no tiene cargado el vencimiento de calibración');
        else if (fecha && vence < fecha) err(it, 'cal', 'el equipo N° ' + t(m[1]) + ' tenía la calibración vencida (' + vence + ')');
      }
      var documento = t(it.documento);
      if (!documento || /^(NA|N\/A|-+)$/i.test(documento)) return;
      if (!ctx.fodOk) { avi(it, 'no se pudo consultar el FOD 02'); return; }
      documento.split(/\/\/|;/).forEach(function (part) {
        if (!t(part)) return;
        var f = findDoc(part, ctx.docs || []);
        if (!f) { avi(it, '«' + t(part) + '» no figura en el FOD 02'); return; }
        if (f.ambiguo) { avi(it, '«' + t(part) + '» coincide con más de un código del FOD 02'); return; }
        var d = f.doc;
        if (/^NO$/i.test(t(d[7]))) err(it, 'plano', d[0] + ' figura como no vigente en el FOD 02');
        if (/^NO APROBADO\b/.test(k(d[6]))) err(it, 'plano', d[0] + ' figura como no aprobado en el FOD 02');
        if (noRev(d[1])) return;
        if (f.rev == null) { if (!new RegExp('[-_.\\s]R(EV)?[-.\\s]?0*' + k(d[1]) + '$').test(k(d[0]))) avi(it, d[0] + ' sin revisión indicada (rige ' + revLabel(d[1]) + ')'); return; }
        var c = revCmp(f.rev, d[1]);
        if (c < 0) err(it, 'plano', 'controlado con ' + d[0] + ' ' + revLabel(f.rev) + ', superada por la ' + revLabel(d[1]));
        else if (c > 0) avi(it, d[0] + ' ' + revLabel(f.rev) + ' es más nueva que la del FOD 02 (' + revLabel(d[1]) + ')');
      });
    });
    return { errores: errores, avisos: avisos, ap: ap, na: na, total: items.length, ultima: ultima };
  }
  return { check: check, iso: iso, findDoc: findDoc, revCmp: revCmp };
})();
/* </reglas-liberacion> */

/** Polígono simple de área positiva. Coordenadas de la imagen, sin unidades físicas. */
function betaPolygon_(pts) {
  var eps = 1e-12;
  var cross = function (a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
  var on = function (a, b, p) { return Math.abs(cross(a, b, p)) <= eps &&
    p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps &&
    p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps; };
  var intersects = function (a, b, c, d) {
    var x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
    return (x > eps && y < -eps || x < -eps && y > eps) && (z > eps && w < -eps || z < -eps && w > eps) ||
      on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
  };
  var area = 0;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    for (var j = i + 1; j < pts.length; j++) {
      if (a[0] === pts[j][0] && a[1] === pts[j][1]) throw pieError_('La zona tiene vértices repetidos', 'bad_request');
      if (j === i + 1 || i === 0 && j === pts.length - 1) continue;
      if (intersects(a, b, pts[j], pts[(j + 1) % pts.length])) throw pieError_('Los bordes de la zona se cruzan o se tocan', 'bad_request');
    }
    // Detecta también un borde que retrocede sobre el anterior.
    var c = pts[(i + 2) % pts.length];
    if (on(a, b, c) || on(b, c, a)) throw pieError_('La zona tiene bordes superpuestos', 'bad_request');
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) <= eps) throw pieError_('La zona no tiene superficie', 'bad_request');
  return pts;
}

function betaBatch_(ops) {
  if (!Array.isArray(ops)) throw pieError_('El lote debe ser una lista de operaciones', 'bad_request');
  if (ops.some(function (op) { return !op || typeof op !== 'object' || Array.isArray(op) ||
    typeof op.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(op.id); })) {
    throw pieError_('El lote tiene una operación o identificador inválido', 'bad_request');
  }
}
