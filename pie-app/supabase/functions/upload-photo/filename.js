// Lógica pura (sin Drive ni Deno) para nombre de archivo y ruta de carpeta de una foto de
// control, igual criterio que fileSafe_/photoFolder_ en apps-script/Code.gs. Se separa del
// handler de la Edge Function (index.ts) para poder probarla con Node sin un entorno Deno.
//
// Diferencia con Code.gs: ahí el nombre usa la fila absoluta de la hoja ("F780"); acá ya no
// existe una fila de hoja, así que se arma con el h (fila original, se conserva por
// trazabilidad durante la transición) + el offset del control ("F780-0").

/** Texto apto para nombre de archivo/carpeta en Drive (misma regla que fileSafe_ en Code.gs). */
function fileSafe(v, max, sep) {
  const t = String(v == null ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|#%\n\r\t]+/g, ' ')
    .replace(/\s+/g, sep == null ? '-' : sep)
    .replace(/-+/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '');
  return t.slice(0, max || 40).replace(/[-\s]+$/, '');
}

/** PIE-<planilla>_F<h>-<off>_<elemento>_<tarea>_<fecha>_<hora>_<inspector>_<nn>.<ext> */
function photoFileName({ sheet, h, off, elemento, tarea, dia, hora, by, nro, ext }) {
  const n = String(nro);
  return ['PIE-' + fileSafe(sheet, 6), 'F' + h + '-' + off, fileSafe(elemento || 'sin-elemento', 30),
    fileSafe(tarea || '', 24), dia, hora, fileSafe(by || '', 6), (nro < 10 ? '0' + n : n)]
    .filter((x) => x !== '').join('_') + '.' + ext;
}

/** ["PIE - Fotos de control - <libro>", "<planilla> - <titulo>", "Fila <h> - <elemento> - <piso>"] */
function photoFolderPath({ libro, sheet, titulo, h, elemento, piso }) {
  return [
    'PIE - Fotos de control - ' + libro,
    fileSafe(sheet + ' - ' + (titulo || ''), 70, ' '),
    fileSafe(['Fila ' + h, elemento, piso].filter((x) => x).join(' - '), 80, ' ')
  ];
}

const PHOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

module.exports = { fileSafe, photoFileName, photoFolderPath, PHOTO_EXT };
