# Proyecto KIR – App PIE (carga móvil de inspecciones)

## Entrega de archivos (preferencia de Federico)
- Cada vez que se genere o actualice un archivo para él (código, zip, Excel, PDF, etc.):
  1. Mandarlo por el chat con un nombre claro y versionado (ej. `PIE-v1.4.zip`), así al descargarlo queda en su carpeta **Descargas**.
  2. **Avisar siempre y explícitamente dónde quedó guardado**: archivo enviado en el chat, rama y carpeta de GitHub (`fedecalzon/CLAUDE-KIR`, rama `claude/pie-carga-movil`, carpeta `pie-app/`), y si corresponde la carpeta de Google Drive.
  3. Recordarle que desde la nube no se puede escribir directo en su computadora: tiene que descargar el archivo del chat.
- Preferir un único zip por versión, con carpetas numeradas por paso de instalación.

## Estructura (2.3.0)
- Backend: **Google Apps Script sobre la planilla**. Federico pidió no migrar a Supabase: la rama `claude/dazzling-lovelace-r5zs5t` no se usa.
- `pie-app/apps-script/` → se pega en el editor de Apps Script: Code.gs, **Beta.gs** (obligatorio), Index.html, appsscript.json.
- `pie-app/pwa/` → la misma app como sitio instalable (opcional; Federico usa el enlace `/exec`, sin Netlify). `apps-script/Index.html` es copia exacta de `pwa/index.html`.
- El bloque `/* <reglas-liberacion> */` es idéntico en Beta.gs y en pwa/index.html (reglas de liberación compartidas).
- `pie-app/planos/planos.json` → vínculo láminas ↔ FOD 02. Las `.webp` no van al repositorio (es público): van en el zip.
- Pruebas: `node herramientas/comprobar.mjs`, `node tests/*.mjs` y `PIE_VER=. PIE_PLANOS=<webp> node herramientas/test-v2/final.test.js wb.json fod.json`.
