# Proyecto KIR – App PIE (carga móvil de inspecciones)

## Entrega de archivos (preferencia de Federico)
- Cada vez que se genere o actualice un archivo para él (código, zip, Excel, PDF, etc.):
  1. Mandarlo por el chat con un nombre claro y versionado (ej. `PIE-v1.4.zip`), así al descargarlo queda en su carpeta **Descargas**.
  2. **Avisar siempre y explícitamente dónde quedó guardado**: archivo enviado en el chat, rama y carpeta de GitHub (`fedecalzon/CLAUDE-KIR`, rama `claude/pie-carga-movil`, carpeta `pie-app/`), y si corresponde la carpeta de Google Drive.
  3. Recordarle que desde la nube no se puede escribir directo en su computadora: tiene que descargar el archivo del chat.
- Preferir un único zip por versión, con carpetas numeradas por paso de instalación.

## Estructura
- `pie-app/apps-script/` → se pega en el editor de Apps Script (Code.gs, Index.html, appsscript.json).
- `pie-app/app/` → PWA que se sube a Netlify. `apps-script/Index.html` es copia exacta de `app/index.html`.
- `pie-app/test/` → simulador de Google Sheets y pruebas (`node test/backend.test.js wb.json fod.json fog.json`).
