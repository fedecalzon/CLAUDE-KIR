// Lógica pura (sin Deno/HTTP) para armar los ops del Web App de Apps Script a partir del
// estado actual en Postgres. No reimplementa la escritura en la hoja: arma exactamente la
// misma forma de op que ya acepta batch_/opCreate_/opUpdate_ en apps-script/Code.gs (la que
// usaba app/index.html antes de migrar), así que del lado de Apps Script no cambia nada.
//
// Separado de index.ts (igual criterio que functions/upload-photo/filename.js) para poder
// probarlo con Node sin un entorno Deno.

/** Hash corto y estable (FNV-1a) para que el id de un op 'update' sea el mismo si el
 * contenido no cambió (dedupe real vía _PIE_LOG ante un reintento) y distinto si cambió. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * registro: { id, h, sig, categoria, resp, piso, sector, etapa, elemento,
 *             controles: [{ off, criterio, documento, fecha, resp, estado, fum_n, obs }] }
 * Devuelve un op 'create' (si el registro todavía no existe en la hoja, h == null) o 'update'.
 */
function opForRegistro(registro) {
  const header = {
    responsables: registro.resp || [],
    piso: registro.piso || '', sector: registro.sector || '',
    etapa: registro.etapa || '', elemento: registro.elemento || ''
  };
  const items = {};
  (registro.controles || []).forEach((c) => {
    items[c.off] = {
      criterio: c.criterio, documento: c.documento || '', fecha: c.fecha || '',
      resp: c.resp || '', estado: c.estado || '', fum: c.fum_n || '', obs: c.obs || ''
    };
  });

  if (registro.h == null) {
    // id estable por registro: un reintento de la creación no duplica el bloque en la hoja
    return { op: 'create', id: 'sync-create-' + registro.id, sheet: registro.categoria, header, items };
  }
  const bodyHash = fnv1a(JSON.stringify({ header, items }));
  return {
    op: 'update', id: 'sync-update-' + registro.id + '-' + bodyHash,
    sheet: registro.categoria, h: registro.h, sig: registro.sig || undefined,
    header, items
  };
}

/** registros: array de snapshots ya deduplicados (uno por registro_id pendiente). */
function buildSyncOps(registros) {
  return registros.map(opForRegistro);
}

/**
 * Aplica el resultado de batch_ (results[]) sobre los registros enviados: para los 'create'
 * exitosos devuelve {registroId, h} para que el caller actualice registros.h en Postgres.
 */
function hAssignmentsFromResults(ops, results) {
  const out = [];
  ops.forEach((op, i) => {
    if (op.op !== 'create') return;
    const r = results[i];
    if (r && r.ok && r.h != null) out.push({ registroId: op.id.replace(/^sync-create-/, ''), h: r.h });
  });
  return out;
}

module.exports = { fnv1a, opForRegistro, buildSyncOps, hAssignmentsFromResults };
