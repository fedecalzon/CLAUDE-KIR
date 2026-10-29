# 3 · Mapa del front (`pwa/index.html`, 2.3.1)

La app es **un solo archivo** de ~5.450 líneas: `<head>` con todo el CSS, un sprite SVG de íconos, el esqueleto (`#top`, `#view`, `#toast`) y un IIFE con todo el JS.

Reglas del archivo:
- No usa librerías, ni build, ni módulos. El JS es **ES5** (`var`, `function`, sin flechas ni `let`) para que corra en el Safari de iOS viejos y dentro del iframe de Apps Script.
- Es un archivo único porque Apps Script lo sirve con `HtmlService.createHtmlOutputFromFile('Index')`.
- Para encontrar algo, buscar por el **título de sección** (`*  Planos, pines y zonas`), no por número de línea.

## Secciones (orden en el archivo)

| Líneas aprox. | Sección | Qué hay |
|---|---|---|
| 1–13 | `<head>` | Meta viewport, `theme-color`, script mínimo que aplica el tema guardado antes de pintar. |
| 15–97 | **Tokens** | El **único lugar con colores**. Claro en `:root`, oscuro dos veces: `[data-theme=dark]` y `prefers-color-scheme` sin `[data-theme=light]`. |
| 98–745 | Base y componentes CSS | Header (§4.1), indicador `.net` (§4.2), botones, campos, tarjetas, filtros, banda de etapa, tarjeta de control `.item` (§4.6), detalle `.det` y FUM, barra inferior `.bbar` (§4.10), toast (§4.11), hojas `ask()` y selector (§4.12/13), planos, pines y zonas, pantalla completa, movimiento reducido. |
| 747–785 | Esqueleto | Sprite `<symbol id="i-…">` (íconos de 24 px con trazo) + `#skipLink`, `header#top`, `main#view`, `#toast`, `<script>/*PIE_BOOT*/</script>`. |
| 786 | **Entorno** | `BOOT`, `IN_GAS`, `MODE`, `APP_VERSION`, `ETAPAS`, `FIELDS`. |
| 799 | **Almacenamiento** | `LS` (localStorage `pie.*`), `KV` (IndexedDB con respaldo). |
| 913 | **Estado** | `S` (ver abajo), `saveSettings`, `saveQueue`/`writeQueue` (guardados en serie). |
| 968 | **Utilidades** | `esc`, `ic(nombre)`, `flash`, `applyTheme`, `uid`, fechas (`today`, `ymd`, `fmtDate`, `ago`), `norm`, `toast`/`hideToast`, `ask()`, `setModalOpen`. |
| 1161 | **Modelo** | `category`, `expandItem`, `getReg`/`overlay`/`opTargets`, `itemState`, `stats`, `listRegs`, `migrateKey`/`adoptResolved`, `editItem`, `editHeader`, `openUpdate`, `queueChanged`, retenciones (`hold`, `isHeld`, `releaseHolds`). |
| 1470 | **FOD 02** | Selector de documento (`openDocPicker`, `renderDocList`), `fodDocs`. |
| 1575 | **Documento superado** | `normDoc`, `revCmp`, `docIndex`, `docStatus`, `docUpgrade`, `regDocAlerts`. |
| 1672 | **Instrumento con N° de serie** | `needsSerial`, `instrSelect`. Equipos y calibración: `equiposOf`, `calState`, `calHtml`, `calVencida`. |
| 1776 | **FUM** | `itemFum`, `queueFum`, `editFum`, `fumBox`, `openFums`, `renderFum` (agenda). |
| 1956 | **Fotos** | `compressImage` (JPEG reducido), `thumbFrom`, `addPhotos`, `regPhotosHtml`. |
| 2086 | **Comunicación** | `ERR`, `apiFail`, `callApi`, `mergeCategories`, `isEditing`, `stripOp`, `handleResults`, `sendPhotos`, `sync`, `finishRender`. |
| 2346 | **Navegación** | `nav(route, {replace})`, `back`, `parentOf`, `popstate`. |
| 2387 | **Render** | `pendingChanges`, `netState`, `netTap`, `renderTop`, `bbar`, teclado (`kbCheck`), `afterRender`, `render()` (despacha por ruta), piezas comunes (`noteHtml`, `chipHtml`, `emptyHtml`). |
| 2601 | **Planos, pines y zonas** | Estado `PL`, `plForDoc`, `plPins`, `plMount` (visor), `plGestures` (pellizco y arrastre), `plDraw`, `plTap`, `plAct` (todas las acciones `pl-*`), `plBajar` (sin conexión), `plToggleFull`. |
| 3470 | Pantallas | `renderHome` (+ `globalSearchHtml`), `renderCategory`, `renderNew`, `renderReg` (+ `itemCard`, `detailHtml`, `decideMark`, `applyMark`, `clearItem`, deshacer), **bloque `<reglas-liberacion>` (`RL`)**, liberación (`stageChecks`, `liberarStage`), `renderWho`, `renderSettings`. |
| 4851 | **Eventos** | Filtro anti doble toque, delegación de `click` por `data-act`, `change`/`input`/`submit`, ciclo de vida (`visibilitychange`, `online`, temporizador de 2 min). |
| 5379 | **Arranque** | `boot()`: tema, `?api&token`, service worker, manifiesto, lectura de la cola y del catálogo, primer `sync`. |

## Estado global `S`

```js
S = {
  catalog, queue, resolved, settings:{apiUrl, token, inspector},
  syncing, syncSince, lastSync, lastError, lastErrorCode,
  route, stack, scroll,            // navegación propia (no depende de history en GAS)
  thumbs, hold, undo, storageError,
  ui: { tab, filter, open, search, regSearch, folded, renderOnBlur,
        lastMark,   // 'clave:off' -> hora (bloqueo de 700 ms por control)
        keep,       // controles marcados que siguen a la vista aunque el filtro los oculte
        photoNote, picking, pinDraft }
}
PL = { full, off, sheet, regKey, id, z, fit, tx, ty, mode:'ver'|'poner'|'zona'|'borrar', draft, sel, moving, hide, q, center, capa, zpts, … }
```

## Patrón de dibujo

- **Todo es `innerHTML` con strings.** Cada `renderX()` arma el HTML y lo asigna a `view.innerHTML`. Todo dato del usuario o de la planilla pasa por `esc()`.
- **No hay virtual DOM.** Para no romper lo que el usuario está haciendo:
  - `finishRender()` es el redibujo que no pidió el usuario (al terminar un envío). Espera si hay desplazamiento o gesto en curso. Con un campo en edición solo actualiza el header y marca `renderOnBlur`.
  - `render({keepScroll:true})` queda anclado al primer control visible (`itemAnchor`), así la pantalla no salta.
  - `refreshItem()` redibuja una sola tarjeta de control.
- **Eventos por delegación**: un solo listener de `click` en `document` busca `[data-act]` y despacha por nombre. Las acciones del visor empiezan con `pl-` y van a `plAct`. Para agregar un botón: `data-act="mi-accion"` + `data-*` con los parámetros, y una rama `if (a === 'mi-accion')` en *Eventos*.
- **Íconos**: `ic('nombre', 'ic-24')` → `<svg class="ic"><use href="#i-nombre"/></svg>`. Para agregar un ícono, sumar un `<symbol id="i-nombre" viewBox="0 0 24 24">` al sprite. El trazo lo da el CSS.
- **Avisos**: `toast(txt, {kind:'ok'|'info'|'warn'|'err', ms, action:{label, fn}})`. Los informativos aparecen arriba; los que tienen acción (Deshacer), abajo.
- **Confirmaciones**: `ask({title, body | html, ok:{label, tone:'primary'|'ap'|'danger'}, alt?:{label}, cancel?})` abre una hoja inferior y devuelve una promesa: `'ok'`, `'alt'` o `null` si se cancela. **No usar `confirm()`.**

## Acciones `data-act` existentes

Generales:
- `back`, `go` (`data-to`), `net`, `sync` (`data-full`, `data-manual`), `retry`, `discard`, `reload`, `install`, `theme`, `who`.

Planilla y registro:
- `tab`, `filter`, `fold`, `goto`, `gofum`, `hdr`, `more` (detalle del control);
- `mark` (AP/RZ/N/A), `clear`, `bulk` (aprobar pendientes), `taskna`, `nextpend`;
- `serial`, `docpick`, `pickdoc`, `pickfree`, `pkmode`, `docupdall`, `closemodal`;
- `plazo`, `liberar`, `rmphoto`, `reg-plan`.

Visor:
- `pl-open`, `pl-lam`, `pl-full`, `pl-fit`, `pl-zoom`, `pl-mode`, `pl-zona`, `pl-zundo`, `pl-zcerrar`, `pl-new`, `pl-pick`, `pl-mark`, `pl-move`, `pl-color`, `pl-capa`, `pl-scope`, `pl-delete-mode`, `pl-quit`, `pl-cancel`, `pl-rechoose`, `pl-goto`, `pl-bajar`, `pl-retry`, `pl-f`.

**Los tests de interfaz usan estos nombres y varias clases (`.item`, `.acts .more`, `.net`, `.bbar`, `.det`, `.pin`…).** Si se renombra uno, hay que actualizar los tests.

## Comportamientos que no hay que romper

| Comportamiento | Dónde | Por qué |
|---|---|---|
| Bloqueo de 700 ms por control al marcar | `decideMark` / `S.ui.lastMark` | Con guantes, un doble toque no tiene que desmarcar. |
| Filtro anti doble toque (350 ms / 24 px sobre otro elemento) | primer listener de *Eventos* | `touch-action:manipulation` convierte un doble toque en dos clicks; el segundo caería sobre la hoja recién abierta. Los tests con Playwright necesitan pausas de 400 a 800 ms entre toques. |
| Retención (`hold`) | FUM nueva, liberación, borrar pin | Da unos segundos para «Deshacer» antes de enviar. |
| `sent` en la operación | `openUpdate`, `editFum` | Una operación que ya salió no se modifica: se crea otra. |
| Cola guardada en serie | `saveQueue` | Un guardado lento nunca pisa uno más nuevo. |
| Barra inferior oculta con teclado o con un detalle a la vista | `kbCheck` (visualViewport), `watchDets` | El teclado de iOS tapa la barra. |
| `isEditing()` evita redibujar | `finishRender` | El cambio de un envío no puede borrar lo que se está escribiendo ni la foto que se está eligiendo. |
| Fecha de la foto = `takenAt` | `addPhotos` | Si no, la foto queda con la fecha del envío. |
| `RL` idéntico al de Beta.gs | bloque `<reglas-liberacion>` | Lo que el celular muestra en verde es exactamente lo que el servidor acepta. |
| Pines filtrados por planilla | `plPins(planoId, sheet)` | La misma lámina sirve a varias planillas. |
| Textos en español rioplatense, «palabras de obra» | toda la UI | Ver la sección 7 de la especificación de diseño. |

## Sistema de diseño (resumen)

- **Colores solo con tokens** (`var(--…)`):
  - `--brand` navy `#1D3557`, `--accent` amarillo `#F5B000`;
  - estados `--ap` verde, `--rz` rojo, `--pend` ámbar, `--na` gris, cada uno con su `-bg`/`-fill`;
  - `--sync`.
  - Contrastes verificados con WCAG AA en claro y oscuro.
- **Medidas**: los controles de marcado tienen 56 px y todo lo tocable al menos 44 px. Gutter de 12 px, y de 16 px desde 375 px de ancho. Radios `--r-sm/md/lg/pill`. El contenido tiene como máximo 760 px de ancho.
- **Tipografía**: la del sistema, 16 px de base (iOS hace zoom en campos de menos de 16 px). Títulos de sección `h2.sec` en 13 px, mayúsculas.
- **Movimiento**: solo `transform` y `filter`, 80 ms. Se respeta `prefers-reduced-motion`.
- La especificación completa (componentes, pantallas, textos exactos, accesibilidad) está en [referencia/especificacion-diseno-v1.6.md](referencia/especificacion-diseno-v1.6.md). Los `§` de los comentarios del código remiten a esa especificación.
