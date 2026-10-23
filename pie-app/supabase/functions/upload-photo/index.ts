// PIE · Edge Function: sube una foto de control a Drive y registra la metadata en Supabase.
//
// *** SIN PROBAR ***: no hay Deno ni credenciales de Google en el entorno donde se escribió
// esto. La lógica de nombre/carpeta (filename.js) sí está probada con Node (ver
// test-filename.js). Antes de usar esto en producción, probarlo manualmente: subir una foto
// de prueba y confirmar que aparece en la carpeta de Drive correcta con el nombre esperado,
// y que la fila en `fotos` se crea bien.
//
// Reemplaza la parte de Drive de opPhoto_ (Code.gs:743). Lo que SÍ está migrado y probado es
// el registro de la metadata (api_op_photo en functions.sql) — esta función es el único paso
// que falta para que el flujo de fotos funcione de punta a punta sin Apps Script.
//
// Variables de entorno necesarias (Supabase · Project Settings › Edge Functions › Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (ya las provee el runtime de Supabase)
//   GOOGLE_SERVICE_ACCOUNT_JSON                credencial de una cuenta de servicio de Google
//   DRIVE_ROOT_FOLDER_ID                       carpeta "PIE - Fotos de control - <libro>" en Drive,
//                                               COMPARTIDA con el email de la cuenta de servicio
//                                               (Editor). Sin esto, Drive devuelve 404/403.
//
// Request esperado (ya en el cuerpo del op 'photo' que arma app/index.html, más la data):
//   POST { token, control_id, sheet, h, off, titulo, elemento, piso, tarea, by,
//          takenAt, mime, data (base64) }
// Respuesta: { ok, archivo_id, enlace } o { ok:false, error, code }.

import { photoFileName, photoFolderPath, PHOTO_EXT } from './filename.js';

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

async function driveAccessToken(): Promise<string> {
  // Cuenta de servicio: JWT firmado con la private_key, canjeado por un access_token.
  // (Esqueleto sin probar — revisar contra la documentación vigente de Google antes de usar.)
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '{}');
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  };
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const toSign = enc(header) + '.' + enc(claim);
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
  const jwt = toSign + '.' + btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
  });
  if (!res.ok) throw new Error('No se pudo autenticar con Google: ' + (await res.text()));
  const { access_token } = await res.json();
  return access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function driveFindOrCreateFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(`'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.json());
  if (found.files?.length) return found.files[0].id;
  const created = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  }).then((r) => r.json());
  return created.id;
}

async function driveUpload(token: string, folderId: string, name: string, mime: string, bytes: Uint8Array): Promise<{ id: string; webViewLink: string }> {
  const boundary = 'pie_' + crypto.randomUUID();
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const multipart = new Blob([body, bytes, closing]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart
  });
  if (!res.ok) throw new Error('Drive rechazó la subida: ' + (await res.text()));
  return res.json();
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const mime = body.mime || 'image/jpeg';
    const ext = PHOTO_EXT[mime];
    if (!ext) return Response.json({ ok: false, code: 'bad_request', error: 'Sólo se aceptan imágenes (JPG, PNG, WEBP o HEIC)' }, { status: 400 });
    if (String(body.data || '').length > PHOTO_MAX_BYTES * 1.4) // base64 ~1.37x el tamaño original
      return Response.json({ ok: false, code: 'bad_request', error: 'La foto es demasiado grande (máximo ~10 MB)' }, { status: 400 });

    const tm = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(body.takenAt || '');
    const dia = tm ? tm[1] : new Date().toISOString().slice(0, 10);
    const hora = tm ? tm[2] + tm[3] : new Date().toISOString().slice(11, 13) + new Date().toISOString().slice(14, 16);

    const token = await driveAccessToken();
    const rootId = Deno.env.get('DRIVE_ROOT_FOLDER_ID')!;
    const [, catName, regName] = photoFolderPath({
      libro: body.libro || 'PIE', sheet: body.sheet, titulo: body.titulo, h: body.h, elemento: body.elemento, piso: body.piso
    });
    const catFolder = await driveFindOrCreateFolder(token, rootId, catName);
    const regFolder = await driveFindOrCreateFolder(token, catFolder, regName);

    // nro correlativo: cuántas fotos ya tiene este control (simple select, no hace falta más)
    const supaUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const countRes = await fetch(`${supaUrl}/rest/v1/fotos?control_id=eq.${body.control_id}&select=id`, {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Prefer: 'count=exact' }
    });
    const nro = Number(countRes.headers.get('content-range')?.split('/')[1] || 0) + 1;

    const name = photoFileName({ sheet: body.sheet, h: body.h, off: body.off, elemento: body.elemento, tarea: body.tarea, dia, hora, by: body.by, nro, ext });
    const bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    if (bytes.length > PHOTO_MAX_BYTES) return Response.json({ ok: false, code: 'bad_request', error: 'La foto es demasiado grande (máximo ~10 MB)' }, { status: 400 });

    const file = await driveUpload(token, regFolder, name, mime, bytes);

    const rpc = await fetch(`${supaUrl}/rest/v1/rpc/api_op_photo`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: body.id, p_control_id: body.control_id, p_archivo_id: file.id, p_enlace: file.webViewLink, p_by: body.by || '' })
    });
    if (!rpc.ok) throw new Error('api_op_photo: ' + (await rpc.text()));

    return Response.json({ ok: true, archivo_id: file.id, enlace: file.webViewLink });
  } catch (err) {
    return Response.json({ ok: false, code: 'error', error: String((err as Error).message || err) }, { status: 500 });
  }
});
