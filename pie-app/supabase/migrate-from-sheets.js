// PIE · Migración única de datos: Google Sheets -> Supabase.
//
// No reimplementa el parseo de la planilla (bloques, columnas, etc.): llama al Web App de
// Apps Script que ya está andando (action=catalog, lo mismo que usa hoy app/index.html) y
// transforma esa respuesta ya parseada al esquema relacional de supabase/schema.sql.
//
// Uso:
//   node migrate-from-sheets.js --api <url-del-web-app> --token <clave> [--out ./export] [--apply]
//
// Sin --apply: sólo descarga el catálogo real y escribe los payloads por tabla en --out (por
// defecto ./export), para revisar antes de tocar nada. Con --apply además los sube a Supabase
// (hace falta SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno: la service key porque esto
// corre una sola vez, a mano, no desde el celular).
//
// Requiere Node 18+ (usa fetch nativo). Sin dependencias, igual que el resto del proyecto.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { out: './export', apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--api') out.api = argv[++i];
    else if (a === '--token') out.token = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--apply') out.apply = true;
    else throw new Error('Argumento desconocido: ' + a);
  }
  if (!out.api || !out.token) throw new Error('Hacen falta --api <url> y --token <clave>');
  return out;
}

async function fetchCatalog(api, token) {
  const url = api + (api.includes('?') ? '&' : '?') + 'action=catalog&token=' + encodeURIComponent(token);
  const res = await fetch(url);
  if (!res.ok) throw new Error('El Web App respondió ' + res.status);
  const body = await res.json();
  if (!body.ok) throw new Error('catalog devolvió error: ' + (body.error || '?'));
  return body;
}

/** Catálogo ya parseado (forma de catalog_ en Code.gs) -> filas por tabla del esquema relacional. */
function transform(cat) {
  const categorias = [];
  const criterios = [];
  const registros = [];
  const controles = [];
  const fotos = [];

  cat.categorias.forEach((c, catOrden) => {
    categorias.push({ sheet: c.sheet, titulo: c.titulo, rubro: c.rubro, oculta: !!c.oculta, orden: catOrden });

    // crit: [[etapa, tarea, muestra, criterio, metodo, instrumento], ...], índice = idx
    c.crit.forEach((row, idx) => {
      criterios.push({
        categoria: c.sheet, idx,
        etapa: row[0] || '', tarea: row[1] || '', muestra: row[2] || '',
        criterio: row[3] || '', metodo: row[4] || '', instrumento: row[5] || ''
      });
    });

    c.registros.forEach((r) => {
      registros.push({
        categoria: c.sheet, h: r.h, sig: r.sig, slots: r.slots, resp: r.resp || [],
        piso: r.piso || '', sector: r.sector || '', etapa: r.etapa || '', elemento: r.elemento || '',
        plano: r.plano || '',
        // clave temporal para enlazar controles/fotos con el id real que asigne Postgres
        _key: c.sheet + '\u0001' + r.h
      });
      // items: [off, idxCriterio, documento, fecha, resp, estado, fum, obs]
      (r.items || []).forEach((it) => {
        const [off, idxCriterio, documento, fecha, resp, estado, fum, obs] = it;
        controles.push({
          _registroKey: c.sheet + '\u0001' + r.h,
          _criterioKey: c.sheet + '\u0001' + idxCriterio,
          off, documento: documento || '', fecha: fecha || null, resp: resp || '',
          estado: estado || '', fum_n: fum || '', obs: obs || ''
        });
        const porOffset = (r.fotos || {})[off] || [];
        porOffset.forEach(([archivo_id, enlace]) => {
          fotos.push({ _controlKey: c.sheet + '\u0001' + r.h + '\u0001' + off, archivo_id, enlace });
        });
      });
    });
  });

  const fums = (cat.fums || []).map((f) => ({ ...f }));
  const equipos = (cat.equipos || []).map((e) => ({ ...e }));
  const liberaciones = (cat.liberaciones || []).map((l) => ({ ...l }));
  const responsables = ((cat.datos && cat.datos.responsables) || []).map((r) => ({ nombre: r.nombre, abrev: r.abrev || '' }));
  const obra_info = cat.datos ? {
    obra: cat.datos.obra || '', direccion: cat.datos.direccion || '', licitacion: cat.datos.licitacion || '',
    metodos: cat.datos.metodos || ['IV', 'ID'], estados: cat.datos.estados || ['AP', 'RZ']
  } : null;

  return { categorias, criterios, registros, controles, fotos, fums, equipos, liberaciones, responsables, obra_info };
}

function writeExport(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, rows] of Object.entries(data)) {
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(rows, null, 2));
  }
}

async function supabaseRest(method, supaUrl, serviceKey, table, { body, query, prefer } = {}) {
  const url = supaUrl.replace(/\/$/, '') + '/rest/v1/' + table + (query ? '?' + query : '');
  const headers = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(table + ': ' + res.status + ' ' + (await res.text()));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function apply(data, { supaUrl, serviceKey }) {
  // Orden por dependencias de FK. Cada insert pide return=representation para recuperar los
  // ids generados por Postgres y poder enlazar las tablas que dependen de ellos.
  if (data.obra_info) {
    await supabaseRest('PATCH', supaUrl, serviceKey, 'obra_info', { body: data.obra_info, query: 'id=eq.true' });
  }
  if (data.responsables.length) {
    await supabaseRest('POST', supaUrl, serviceKey, 'responsables',
      { body: data.responsables, prefer: 'resolution=merge-duplicates' });
  }

  await supabaseRest('POST', supaUrl, serviceKey, 'categorias',
    { body: data.categorias, prefer: 'resolution=merge-duplicates' });

  const critRows = await supabaseRest('POST', supaUrl, serviceKey, 'criterios',
    { body: data.criterios, query: 'on_conflict=categoria,idx', prefer: 'resolution=merge-duplicates,return=representation' });
  const critId = new Map(critRows.map((r) => [r.categoria + '\u0001' + r.idx, r.id]));

  const regPayload = data.registros.map(({ _key, ...r }) => r);
  const regRows = await supabaseRest('POST', supaUrl, serviceKey, 'registros',
    { body: regPayload, query: 'on_conflict=categoria,h', prefer: 'resolution=merge-duplicates,return=representation' });
  const regId = new Map(regRows.map((r) => [r.categoria + '\u0001' + r.h, r.id]));
  // también lo necesitamos indexado por la _key original (categoria+h) para los controles
  data.registros.forEach((r) => { if (!regId.has(r._key)) regId.set(r._key, regId.get(r.categoria + '\u0001' + r.h)); });

  const ctlPayload = data.controles.map(({ _registroKey, _criterioKey, ...c }) => ({
    ...c, registro_id: regId.get(_registroKey), criterio_id: critId.get(_criterioKey)
  })).filter((c) => {
    if (!c.registro_id || !c.criterio_id) { console.warn('control sin registro/criterio resuelto, se omite:', c); return false; }
    return true;
  });
  const ctlRows = ctlPayload.length ? await supabaseRest('POST', supaUrl, serviceKey, 'controles',
    { body: ctlPayload, query: 'on_conflict=registro_id,off', prefer: 'resolution=merge-duplicates,return=representation' }) : [];
  const ctlId = new Map(ctlRows.map((c) => [c.registro_id + '\u0001' + c.off, c.id]));

  const fotoPayload = data.fotos.map(({ _controlKey, ...f }) => {
    const [cat, h, off] = _controlKey.split('\u0001');
    return { ...f, control_id: ctlId.get(regId.get(cat + '\u0001' + h) + '\u0001' + off) };
  }).filter((f) => f.control_id);
  if (fotoPayload.length) {
    await supabaseRest('POST', supaUrl, serviceKey, 'fotos',
      { body: fotoPayload, query: 'on_conflict=control_id,archivo_id', prefer: 'resolution=merge-duplicates' });
  }

  if (data.equipos.length) {
    await supabaseRest('POST', supaUrl, serviceKey, 'equipos',
      { body: data.equipos, query: 'on_conflict=equipo,serie', prefer: 'resolution=merge-duplicates' });
  }
  if (data.fums.length) {
    await supabaseRest('POST', supaUrl, serviceKey, 'fums',
      { body: data.fums, query: 'on_conflict=numero', prefer: 'resolution=merge-duplicates' });
  }
  if (data.liberaciones.length) {
    // sin clave natural: sólo tiene sentido correr esto una vez (ver supabase/README.md)
    await supabaseRest('POST', supaUrl, serviceKey, 'liberaciones', { body: data.liberaciones });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('Descargando catálogo real desde', args.api, '...');
  const cat = await fetchCatalog(args.api, args.token);
  console.log(cat.categorias.length, 'categorías,', cat.categorias.reduce((n, c) => n + c.registros.length, 0), 'registros.');

  const data = transform(cat);
  writeExport(args.out, data);
  console.log('Export escrito en', args.out);

  if (args.apply) {
    const supaUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supaUrl || !serviceKey) throw new Error('--apply requiere SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno');
    console.log('Subiendo a Supabase', supaUrl, '...');
    await apply(data, { supaUrl, serviceKey });
    console.log('Listo.');
  } else {
    console.log('(Modo sólo-export: corré de nuevo con --apply cuando lo hayas revisado.)');
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { transform };
