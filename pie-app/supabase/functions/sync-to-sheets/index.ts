// PIE · Edge Function: sincroniza Supabase -> Sheets (sólo reporte, nunca al revés).
//
// *** SIN PROBAR *** (no hay Deno ni un Web App real desplegado en este entorno). La parte que
// sí está probada es toda la lógica real: qué ops armar (transform.js, con Node) y que
// sheets_sync_pendiente no pierda cambios ante una carrera (api_sync_pendientes/api_sync_ack
// en functions.sql, probadas contra Postgres real). Esta función es el pegamento HTTP entre
// ambas, pensado para correr cada 1-5 minutos (ver "Cómo programarla" en el README).
//
// Clave del diseño: NO reimplementa la escritura en la hoja. Arma los mismos ops que ya
// entendía app/index.html (create/update) y los manda al Web App de Apps Script existente
// (action=batch) — exactamente el código que ya corre en producción hoy.
//
// Variables de entorno (Supabase · Edge Functions › Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (las provee el runtime)
//   APPS_SCRIPT_URL   la URL del Web App (la de PIE › Ver enlace de la app)
//   PIE_TOKEN         la misma clave que usa hoy la app del celular

import { buildSyncOps, hAssignmentsFromResults } from './transform.js';

Deno.serve(async () => {
  const supaUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appsScriptUrl = Deno.env.get('APPS_SCRIPT_URL')!;
  const token = Deno.env.get('PIE_TOKEN')!;

  const rpc = (name: string, args: Record<string, unknown>) =>
    fetch(`${supaUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    }).then(async (r) => {
      if (!r.ok) throw new Error(name + ': ' + (await r.text()));
      return r.json();
    });

  try {
    const pend = await rpc('api_sync_pendientes', {});
    const registros = pend.registros || [];
    if (!registros.length) return Response.json({ ok: true, synced: 0 });

    const ops = buildSyncOps(registros);

    const res = await fetch(appsScriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', token, ops })
    });
    if (!res.ok) throw new Error('Apps Script respondió ' + res.status);
    const body = await res.json();
    if (!body.ok) throw new Error('batch devolvió error: ' + (body.error || '?'));

    const failed = (body.results || []).filter((r: { ok: boolean }) => !r.ok);
    if (failed.length) {
      // no se ackea: sheets_sync_pendiente sigue marcado y se reintenta en la próxima corrida
      console.error('ops fallidos, no se ackea esta tanda:', JSON.stringify(failed));
      return Response.json({ ok: false, synced: 0, failed }, { status: 207 });
    }

    const hAssignments = hAssignmentsFromResults(ops, body.results);
    await rpc('api_sync_ack', { p_pending_ids: pend.pending_ids, p_h_assignments: hAssignments });

    return Response.json({ ok: true, synced: registros.length });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500 });
  }
});
