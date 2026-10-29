# PIE 2.3.1 · Carga de inspecciones y planos (FOP 01)

App para cargar desde el celular los **Planes de Inspección y Ensayo** de la planilla `PIE - CORE`, con o sin señal, y marcarlos sobre las láminas de la obra. Backend: **Google Apps Script sobre la planilla** (no usa otra base de datos).

## Qué hace
- **Planillas y registros**: las planillas por rubro, los registros con su avance y los requisitos (PRE / DURANTE / POST / DOC). Registro nuevo debajo del último, con el formato del modelo.
- **Controles AP / RZ / N/A** de 56 px, con marcado seguro: un doble toque no desmarca, «Borrar carga» con Deshacer y «Aprobar los N pendientes» / «N/A a la tarea».
- **FUM en el FOG 01** al marcar RZ, cerradas al aprobar la reinspección. Hay una agenda de rechazos.
- **Plano del registro (FOD 02)**: uno por registro, con aviso de revisión superada.
- **Visor de planos dentro del registro**:
  - hojas, zoom, pellizco y pantalla completa;
  - **pines y zonas** por registro, etapa o tarea, con colores y filtro por estado;
  - AP / RZ / N/A desde la marca;
  - borrar con Deshacer;
  - láminas **disponibles sin conexión** (✓ / ↓ y «Bajar las que faltan»).
- **Fotos del registro** con nota, fecha (la de la toma) y autor. Se guardan en Drive con nombre rastreable.
- **Equipos de medición**: la hoja `EQUIPOS DE MEDICIÓN` guarda el N° de serie y el vencimiento de calibración de cada equipo. La app avisa los vencidos y los que están por vencer.
- **Liberación de etapa** con checklist. Las **mismas reglas** corren en el celular y en el servidor, así que lo que el celular muestra en verde es lo que el PIE acepta. La liberación queda en la hoja `LIBERACIONES`.
- **Búsqueda global**: registros, FUM y planos del FOD 02, con el veredicto de revisión (vigente o superada).
- **Sin señal**: todo queda en el celular y se envía solo, en tandas de 25. Una operación no se duplica aunque se corte a mitad de camino.

## Reglas para liberar una etapa
Bloquean (hay que corregir antes):
- controles pendientes;
- controles en RZ;
- FUM abiertas;
- un AP sin fecha válida o sin responsable;
- un instrumento sin N° de serie;
- un equipo que no figura en EQUIPOS DE MEDICIÓN, que no tiene el vencimiento cargado o que estaba vencido el día del control;
- un plano controlado con una revisión ya superada, no vigente o no aprobado en el FOD 02;
- el plano del registro superado.

No bloquean, pero quedan anotados como avisos en `LIBERACIONES`:
- un plano que no figura en el FOD 02;
- un plano sin revisión escrita, o con una revisión más nueva que la del FOD 02;
- un código ambiguo;
- una FUM indicada que no está en el índice;
- un FOD 02 que no se pudo consultar.

La fecha de la liberación es la del día en que se decidió (sin adelantar ni antes de los controles). La columna «Registrada» guarda la hora real de llegada al PIE. Una etapa ya liberada no se duplica.

## Estructura
| Carpeta | Contenido |
|---|---|
| `apps-script/` | Se pega en el editor de Apps Script de la planilla: `Code.gs`, `Beta.gs` (reglas de liberación, zonas y lotes; obligatorio), `Index.html` y `appsscript.json`. |
| `pwa/` | La misma app como sitio instalable (opcional): `index.html` (copia exacta de `apps-script/Index.html`), `sw.js`, manifiesto e íconos. |
| `planos/` | `planos.json`, que vincula cada lámina con sus documentos del FOD 02 y con una o varias planillas (`"planilla": "6"` o `["11", "20", "38"]`). Las imágenes `.webp` de la obra no están en el repositorio: van en la carpeta Planos de Drive y en el zip de entrega. |
| `tests/` | Pruebas de reglas, gestos, colores y fotos (Node, sin dependencias). |
| `herramientas/` | Simulador de Apps Script (`test-v2/`), comprobación de sintaxis y conversión de PDF a láminas. |

## Documentación para desarrollo
Ver [`docs/`](docs/README.md): funcionamiento, API y datos, mapa del front, método de trabajo y reglas de obra. Para trabajar el front sin Google: `node herramientas/dev-server.js <wb.json> [fod.json] --planos <carpeta>`.

## Instalar o actualizar
Ver [`INSTALAR.md`](INSTALAR.md).

## Pruebas (para desarrollo)
```sh
node herramientas/comprobar.mjs          # sintaxis y Index.html == pwa/index.html
node tests/beta.test.mjs && node tests/gestures.test.mjs && node tests/pin_colors.test.mjs && node tests/beta4.test.mjs
# contra el libro real exportado a JSON (ver herramientas/test-v2/export_xlsx.py):
PIE_VER=. PIE_PLANOS=<carpeta con las .webp> node herramientas/test-v2/final.test.js wb.json fod.json
```
El bloque `/* <reglas-liberacion> … */` tiene que quedar **idéntico** en `apps-script/Beta.gs` y en `pwa/index.html`; `final.test.js` lo comprueba. `Index.html` y `pwa/index.html` también tienen que ser iguales.

## Límites conocidos
- La clave es compartida: no hay usuarios ni roles individuales. Por eso es para el equipo interno, no para subcontratistas ni para aprobar pagos.
- Dos celulares que cambian el mismo control sin señal: gana el último que envía.
- Las zonas se dibujan sobre la imagen. No miden m² reales hasta calibrar la escala de cada lámina.
- El pellizco con dos dedos y el selector de fotos de iOS se prueban en el iPhone; acá se probaron en un celular emulado.
