# 1 · Cómo funciona PIE (2.3.1)

PIE carga desde el celular los **Planes de Inspección y Ensayo (FOP 01)** de la obra COMAFI Reconquista (KIR S.A.). Trabaja con o sin señal, y escribe directamente en la planilla de Google **PIE - CORE**.

## Piezas

```
 iPhone (Safari / ícono en inicio)
 ┌──────────────────────────────────────────────┐
 │ index.html  (un solo archivo: HTML+CSS+JS)    │
 │  · S.catalog  ← copia local del PIE           │
 │  · S.queue    ← cola de cambios sin enviar    │
 │  · IndexedDB 'pie' / localStorage 'pie.*'     │
 └───────────────┬──────────────────────────────┘
                 │ callApi({action, token, …})
                 │  · webapp/sidebar: google.script.run.api(req)
                 │  · pwa:            POST <url /exec> (text/plain, JSON)
 ┌───────────────▼──────────────────────────────┐
 │ Apps Script (Code.gs + Beta.gs)              │
 │  handle_ → ping | catalog | plano | sheet |  │
 │            batch(ops: create, update, photo, │
 │                  fum, liberar, pin)          │
 └───────────────┬──────────────────────────────┘
                 │ SpreadsheetApp / DriveApp
   Planilla PIE - CORE (una hoja por planilla + DATOS, EQUIPOS DE MEDICIÓN,
   LIBERACIONES, ocultas _PIE_LOG, _PIE_FOTOS, _PIE_FUM, _PIE_PINES)
   FOD 02 (otro libro, solo lectura) · FOG 01 (otro libro, se escriben las FUM)
   Drive: «PIE - Fotos de control»/… y su subcarpeta «Planos» (<id>.webp + planos.json)
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| Backend | `apps-script/Code.gs` | Lee y escribe la planilla y sirve la app. Tiene el menú PIE, la API JSON, el lector de bloques, FUM ↔ FOG 01, fotos, pines y planos. |
| Backend | `apps-script/Beta.gs` | Reglas de liberación del lado del servidor (bloque compartido `RL`), polígonos de zonas y límite de lote. Es **obligatorio**. |
| Front | `pwa/index.html` = `apps-script/Index.html` | Toda la app. **Son el mismo archivo, byte a byte.** |
| PWA | `pwa/sw.js`, `manifest.webmanifest`, íconos | Solo se usan si la app se publica como sitio propio. Federico usa el enlace `/exec` y no la PWA. |
| Láminas | `planos/planos.json` + `<id>.webp` en Drive | Vinculan cada lámina con sus códigos del FOD 02 y con las planillas. |

## Tres modos de ejecución (`MODE`)

| Modo | Cómo se abre | Transporte | Notas |
|---|---|---|---|
| `webapp` | El enlace `/exec` de la implementación. **Es el que usa Federico.** | `google.script.run.api(req)` | El HTML lo sirve `serveApp_()`, que inyecta `window.PIE_BOOT = {mode, version}` en `/*PIE_BOOT*/`. No hay `history`/hash (corre en un iframe de Google). Sin señal sigue andando una vez abierto, pero no se puede **abrir** sin señal. |
| `sidebar` | PIE › Abrir panel, dentro de la planilla | `google.script.run` | `PIE_BOOT.token` trae la clave. `irA(hoja, fila)` mueve la planilla a un registro. |
| `pwa` | `pwa/` publicado en un sitio propio (o el entorno local) | `fetch POST` a la URL `/exec` | La configuración llega por `?api=<url>&token=<clave>` o desde Ajustes › Conexión. Tiene service worker, manifiesto y rutas en `location.hash`. |

`IN_GAS = !!google.script.run`. Casi todo el código es igual en los tres modos; las diferencias están en `callApi`, `nav/back` y `boot`.

## Ciclo de datos

1. **Arranque (`boot`)**: lee `catalog` y `queue` de IndexedDB y dibuja enseguida, con o sin señal. Si hay señal, corre `sync({full:true})`. Si no hay inspector elegido, va a `/quien`.
2. **Catálogo**: `action:'catalog'` devuelve todo el PIE en una sola respuesta: planillas, registros, FOD 02, FUM, equipos, liberaciones, pines, planos y DATOS (ver [02-api-y-datos.md](02-api-y-datos.md)). Se guarda entero en `KV 'catalog'`. Se vuelve a pedir si pasaron más de 10 minutos, si se pide «actualizar» o en la primera descarga.
3. **Edición local**: cada acción del usuario **no llama al servidor**. Agrega o modifica una operación en `S.queue` (`openUpdate`, `queueFum`, `pinOp`…), guarda la cola (`saveQueue`) y vuelve a dibujar. La pantalla muestra siempre el **registro vivo**: el catálogo con los cambios de la cola superpuestos (`getReg` + `overlay`).
4. **Envío (`sync`)**:
   - Manda un lote de hasta 25 operaciones que no sean fotos y no estén retenidas (`action:'batch'`).
   - Después manda las fotos de a una.
   - Después actualiza el catálogo si corresponde.
   - Lo disparan: el indicador, la vuelta de la señal (`online`), volver a la app (`visibilitychange`/`pageshow`), un temporizador de 2 minutos y `queueChanged()` (con demora).
5. **Respuesta (`handleResults`)**:
   - Cada operación aceptada sale de la cola.
   - Un alta (`create`) deja `S.resolved[id] = {sheet, h}`, y la clave del registro pasa de `p<id>` a `h<fila>` (`migrateKey`, `adoptResolved`).
   - `retry`, `busy` y `network` vuelven a quedar pendientes.
   - Cualquier otro error deja la operación en `status:'error'`; se ve en Ajustes › Envíos.
   - El lote también devuelve las planillas tocadas, las FUM, las liberaciones y los pines al día (`mergeCategories`).
6. **Idempotencia**: cada operación tiene un `id` (`uid()`). El servidor lo anota en `_PIE_LOG`. Si llega dos veces (por un corte a mitad de camino), responde `dup:true` sin repetir nada.

## Claves de registro y rutas

- `h<fila>`: un registro que ya existe en la planilla. La fila es la de la fila «TAREA» del bloque.
- `p<id>`: un alta que todavía está solo en el celular. Pasa a `h<fila>` cuando el PIE la confirma.

| Ruta | Pantalla | Función |
|---|---|---|
| `/` | Inicio: búsqueda global, recientes, rubros y FUM abiertas | `renderHome` |
| `/quien` | ¿Quién sos? (inspector) | `renderWho` |
| `/ajustes` | Ajustes: conexión, envíos pendientes y con error, tema, planos sin conexión | `renderSettings` |
| `/fum` | Agenda de FUM | `renderFum` |
| `/c/<hoja>` | Planilla: registros y requisitos | `renderCategory` |
| `/c/<hoja>/nuevo` | Nuevo registro (alta debajo del último bloque) | `renderNew` |
| `/c/<hoja>/r/<h…\|p…>` | Registro: controles, plano, fotos, liberación de etapa y visor de láminas | `renderReg` |

## Persistencia en el celular

| Dónde | Clave | Contenido |
|---|---|---|
| IndexedDB `pie` / store `kv` (`KV`) | `catalog` | Última respuesta de `catalog`, con lo que mezclaron los lotes después. |
| | `queue` | La cola de operaciones. Es lo único que **no se puede perder**. |
| | `img:<id>` | Foto pendiente (JPEG en dataURL). |
| | `thumb:<id>` | Miniatura de la foto. |
| | `plano.<id>.<v>` | Lámina descargada para usar sin señal. |
| localStorage (`LS`, prefijo `pie.`) | `settings` | `{apiUrl, token, inspector}` |
| | `resolved` | `id` de alta → `{sheet, h}` |
| | `lastSync`, `theme`, `recent`, `planosOk`, `instr.*`, `doc.*` | Estado de la interfaz y recuerdos de lo último elegido. |
| | `kv.<k>` + `kvlocal.<k>` | Respaldo de `KV` si IndexedDB falla: mientras exista la marca, ese es el valor más nuevo. |

## Planos y láminas

- `planos.json` en la carpeta Drive «Planos» es una lista de láminas: `{id, planilla (texto o lista), titulo, sub, rev, w, h, v, codigo, documentos[]}`.
- El servidor expande `planilla` a una entrada por planilla (`readPlanos_`). Por eso el catálogo puede traer la misma lámina repetida, con una planilla distinta en cada entrada.
- Un registro se vincula con una lámina por su DOCUMENTO: `planoDocKey()` normaliza el código y la revisión (`-R07` = `_07`). Tiene que coincidir con `documentos`, `id`, `sub` o `codigo-rev`. **Nunca se vincula por un fragmento ni por una revisión distinta.**
- La imagen se pide con `action:'plano'` (base64 webp de hasta 6 MB) y queda en `KV` para usarla sin señal.
- Los pines y las zonas están en `_PIE_PINES`. Las coordenadas se guardan normalizadas de 0 a 1 sobre la lámina. Cada uno tiene un alcance: registro, etapa o tarea (`alc:{k,v}`). `plPins(planoId, sheet)` filtra por lámina **y** por planilla.

## Seguridad y límites

- Una **clave compartida** (`PIE_TOKEN` en Propiedades del script) viaja en cada request (en el cuerpo, nunca en la URL). No hay usuarios: el inspector es un texto que se elige en `/quien`.
- Si dos celulares cambian el mismo control sin señal, gana el último que envía.
- Apps Script tarda entre 1 y 10 s por request y no responde el preflight CORS. Por eso los POST van como `text/plain`.
