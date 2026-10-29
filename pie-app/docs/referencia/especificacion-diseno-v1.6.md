> **Documento de referencia (histórico).** Se escribió para la v1.6 (rediseño de la interfaz); los § de los comentarios del código remiten acá. La sección 8 menciona pruebas de la v1.6 que ya no están en el repositorio. El código actual (2.3.1) manda: si algo no coincide, vale lo que está en `pwa/index.html` y `apps-script/`.

## Especificación v1.6

### 0. Alcance, prioridades y orden de trabajo

**Archivos.**
- Se modifican `pie-app/app/index.html`, `app/sw.js`, `app/manifest.webmanifest` y `pie-app/README.md`.
- `apps-script/Index.html` queda como copia byte a byte de `app/index.html`.
- **No se tocan** `Code.gs`, el formato de las operaciones de la cola (`create/update/photo/fum`), las claves de IndexedDB (`catalog`, `queue`, `img:*`) ni `resolved`.
- No hay recursos externos: todo funciona sin señal y dentro de HtmlService.
- `APP_VERSION = '1.6.0'` y `CACHE = 'pie-carga-v1.6.0'`.

**Glosario de interfaz (obligatorio en todos los textos).**

| Término | Significado |
|---|---|
| enviar | del celular al PIE |
| actualizar | del PIE al celular |
| plano | nunca «documento» ni «doc.» |
| planilla | la hoja numerada |
| el PIE | el archivo |
| control | cada línea con AP/RZ/N/A |

**Prioridades.**

- **P0 (sin esto no sale):**
  - Bloque 0 de integridad: FLOW-02, eng-03(1), eng-02(1-4), eng-08 (blur y envío al volver) y campos de 16 px (V04, a11y-04, eng-05).
  - Marcado seguro: FLOW-03, a11y-03, eng-04(1-2), eng-07, FLOW-15, C07, C08, C06 (frontend) y retención de la FUM.
  - Plano superado una sola vez: FLOW-06, C10.
  - Indicador: V08, C01, FLOW-09 (conteo y toque sin señal).
  - Tokens y contraste: V01, V02, V03, a11y-01, a11y-05, a11y-06.
  - AP/RZ/N/A de 56 px: a11y-02.
  - Barra inferior y avisos: V07, a11y-07, eng-06, FLOW-08, eng-12, a11y-13.
  - Resumen del registro y plano: V06, FLOW-01, a11y-12.
  - `ask()`.
- **P1:**
  - Visual y estructura: V05, V09, V10, V11, V12, V13/FLOW-12, V14, V15, V16, V18.
  - Accesibilidad: a11y-08 (Automático/Claro/Oscuro), a11y-09 (tamaños), a11y-10, a11y-14, a11y-15, a11y-16, a11y-17.
  - Flujo: FLOW-07, FLOW-11, FLOW-13 (subtítulo y banda), FLOW-16 (el chip abre el selector), FLOW-17, PROD-03 (aviso «Sin fecha» y orden).
  - Ingeniería: eng-03(2-4), eng-10, eng-13 (sin `pushState`), eng-14, eng-15, eng-16, eng-18, eng-20.
  - Textos: C02-C05, C09, C11-C20.
- **P2 (si entra; si no, v1.6.x):**
  - «Seguir» (FLOW-10/PROD-06, mínimo).
  - «N/A a la tarea» (FLOW-04a).
  - Atajos de fecha de reinspección (PROD-03).
  - `patchSummary` y render sólo si cambió algo (eng-01).
  - Avisos del PIE guardados (eng-12).
  - Borradores de observaciones (eng-08).
  - Miniatura de 160 px en memoria (eng-09, sin cambiar lo guardado).

**Orden de commits.** Cada commit pasa la E2E adaptada.

| # | Contenido | Secciones |
|---|---|---|
| 0 | Bloque 0 de integridad. Si la v1.6 completa no se termina en esta iteración, este commit se entrega solo como **v1.5.1** (`PIE-v1.5.1.zip`). En ese caso «Borrar carga» usa `confirm()` transitoriamente. | §6.7, §6.9, campos de 16 px, lógica de §6.4 |
| 1 | Tokens, `<head>`, base, sprite e `ic()` | §1-§3 |
| 2 | Header, indicador, toast, `ask()`, barra inferior | §4.1-4.2, §4.10-4.12 |
| 3 | Registro: resumen, plano, filtros, banda, tarjeta, detalle, FUM, selector FOD 02 | §4.5-4.9, §4.13, §5.6 |
| 4 | Comportamiento | §6.1-6.6, §6.8 |
| 5 | Resto de pantallas y textos | §5, §7 |
| 6 | P2 | — |
| 7 | `sw.js`, manifest, README, copia de `Index.html`, pruebas | §6.11, §8 |

**Metas medibles.**

| Acción | v1.5 | v1.6 |
|---|---|---|
| Doble toque con guante sobre AP | Lo desmarca sin aviso | No hace nada |
| RZ por error corregido con el detalle abierto | Con señal, la FUM se numera y después queda «Anulada» | No llega nada al FOG 01 |
| «Limpiar» sobre un RZ | Borra sin preguntar y deja la FUM huérfana | Pide confirmación, anula o descarta la FUM y ofrece Deshacer |
| Primer control al abrir un registro | 13: AP a 760 px. SE: ningún control a la vista | 13 (390×664): AP/RZ/N/A visibles sin desplazarse. SE (320×568): criterio visible |
| Sincronización de un alta | Salta arriba y borra lo escrito | Sin salto y sin pérdida |
| Elementos flotantes sobre el contenido | Píldora de 242 px, FAB y aviso a media pantalla | Barra acoplada que se oculta con el teclado o con un detalle a la vista |
| Zoom de iOS al tocar un campo | En todos | En ninguno |
| Contraste | AP marcado en oscuro 2,25:1; bordes 1,29:1 | Texto ≥ 4,5:1; bordes de controles ≥ 3:1, en los dos temas |
| Foto de un control | 5 toques y 1-2 desplazamientos | Fotos arriba del detalle (con FUM, debajo de ella), sin desplazarse |

---

### 1. Tokens

#### 1.1 Reglas de color (una sola regla por color)

| Color | Uso exclusivo |
|---|---|
| **Navy** `--brand` / `--primary` | Header, etiqueta de planilla y la acción principal de cada pantalla (Listo, Crear registro, Nuevo registro, Guardar y probar, Enviar y actualizar). En oscuro, la acción principal pasa a superficie invertida. |
| **Ámbar** `--accent` / `--pend` | Sólo lo que falta controlar o falta un dato: «Siguiente pendiente», filtro «Pend.», «faltan N», «Falta N° de serie», «Sin fecha de reinspección», anillo de destino. **Nunca** como texto sobre claro (1,89:1): en claro el texto pendiente va en `--pend`. |
| **Verde / rojo / gris** | Sólo AP, RZ y N/A, y lo que se deriva de ellos (plano vigente = verde, superado = rojo). |
| **Azul** `--sync` | Sólo «sin enviar» (chips y relleno del indicador). La revisión del plano deja de usarlo. |
| **Desaparecen** | `#2f6fde` y `--ink` como relleno de botones. |
| **Regla general** | El color nunca va solo: siempre lo acompaña un ícono, un texto o una forma. |

#### 1.2 Bloque CSS

Reemplaza las líneas 11-52 y los `@media (prefers-color-scheme:dark)` sueltos de las líneas 110 y 170. **No queda ningún hex fuera de estos bloques**, salvo dentro de los data-URI de `--sel-chev`.

```css
:root{
  --bg:#E9EDF2; --surface:#FFFFFF; --surface-2:#F4F6F9;
  --ink:#0E1726; --muted:#46546A; --placeholder:#5F6B7C;
  --line:#D5DCE4;                 /* sólo separadores */
  --border-strong:#738194;        /* borde de todo control interactivo */
  --brand:#1D3557; --on-brand:#FFFFFF; --brand-sub:#C9D3DF; --hdr-line:transparent;
  --primary:#1D3557; --on-primary:#FFFFFF;
  --accent:#F5B000; --on-accent:#1A1300; --accent-edge:#A87300;
  --pend:#7A4B00; --pend-bg:#FFF1CC;
  --ap:#13703A; --ap-fill:#13703A; --ap-bg:#E1F2E7;
  --rz:#B3202A; --rz-fill:#B3202A; --rz-bg:#FBE3E4; --rz-tint:#FBE3E4;
  --na:#4D5969; --na-fill:#4D5969; --na-bg:#E6EAEF;
  --on-state:#FFFFFF;
  --sync:#2B4C7E; --sync-bg:#E4ECF7;
  --tag:#1D3557; --on-tag:#FFFFFF;
  --focus:#1D3557; --focus-ring:rgba(29,53,87,.22); --hl-ring:#A87300;
  --toast-bg:#1C2738; --toast-ink:#FFFFFF; --toast-edge:#1C2738; --toast-act:#F5B000;
  --k-ok:#6EE7A0; --k-err:#FF8A8A; --k-warn:#F5B000; --k-info:#9DBBFF;
  --scrim:rgba(10,15,25,.5);
  /* indicador sobre el header (navy en ambos temas) */
  --net-line:rgba(255,255,255,.4); --net-ok:#6EE7A0; --net-off:#C3CCD7;
  --net-q-bg:#E4ECF7; --net-q-ink:#1D3557; --net-err:#C2333B;
  --sel-chev:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2346546A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 9l7 7 7-7'/%3E%3C/svg%3E");
  --sh-1:0 1px 2px rgba(14,23,38,.06),0 1px 3px rgba(14,23,38,.08);
  --sh-bar:0 -2px 8px rgba(14,23,38,.08);
  --sh-pop:0 8px 24px rgba(14,23,38,.22);
  --r-sm:6px; --r-md:10px; --r-lg:14px; --r-pill:999px;
  --gutter:12px;
  --hdr-h:calc(56px + env(safe-area-inset-top));
  --font:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (min-width:375px){ :root{ --gutter:16px; } }

/* Oscuro: el MISMO bloque, dos veces (tema forzado y automático) */
:root[data-theme="dark"]{ /* … idéntico al de abajo … */ }
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --bg:#0A0F15; --surface:#151C26; --surface-2:#1C2531;
  --ink:#E8EDF3; --muted:#A9B4C2; --placeholder:#8794A5;
  --line:#2A3542; --border-strong:#6E7D91;
  --brand:#142338; --hdr-line:#2A3542;
  --primary:#E8EDF3; --on-primary:#0E1726;
  --accent-edge:#F5B000;
  --pend:#F5B000; --pend-bg:#33291A;
  --ap:#4CC27F; --ap-fill:#1E8048; --ap-bg:#16301F;
  --rz:#FF8A8A; --rz-fill:#C2333B; --rz-bg:#3A1C1F; --rz-tint:#2A171A;
  --na:#A9B4C2; --na-fill:#626E7F; --na-bg:#232C38;
  --sync:#9DBBFF; --sync-bg:#1D2C4A;
  --tag:#2A4A7A;
  --focus:#F5B000; --focus-ring:rgba(245,176,0,.35); --hl-ring:#F5B000;
  --toast-bg:#E8EDF3; --toast-ink:#0E1726; --toast-edge:#E8EDF3; --toast-act:#1D3557;
  --k-ok:#13703A; --k-err:#B3202A; --k-warn:#A87300; --k-info:#2B4C7E;
  --scrim:rgba(0,0,0,.6);
  --sel-chev:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A9B4C2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 9l7 7 7-7'/%3E%3C/svg%3E");
  --sh-1:none; --sh-bar:none; --sh-pop:0 8px 24px rgba(0,0,0,.5);
  color-scheme:dark;
}}
```

**Renombres.**
- `--card` pasa a `--surface` (todos los usos).
- `.btn.tiny` se elimina y se reemplaza por `.btn.sm`.
- `.tiny` y `.small` pasan a `.help` o `.meta` (14 px).
- `.kv` se elimina.
- `.chip.sync` se mantiene (ahora con tokens).

#### 1.3 Contrastes verificados (WCAG 2.x, calculados sobre estos hex)

| Par | Claro | Oscuro | Mínimo |
|---|---|---|---|
| ink / surface · bg · surface-2 | 17,96 · 15,28 · 16,59 | 14,55 · 16,34 · 13,13 | 4,5 |
| muted / surface · bg · surface-2 · rz-tint | 7,67 · 6,53 · 7,09 · 6,29 | 8,15 · 9,15 · 7,36 · 8,09 | 4,5 |
| placeholder / surface | 5,41 | 5,55 | 4,5 |
| border-strong / surface · bg · surface-2 · rz-tint | 3,96 · 3,37 · 3,66 · 3,25 | 4,08 · 4,58 · 3,68 · 4,05 | 3 |
| blanco / header · subtítulo `--brand-sub` / header | 12,36 · 8,16 | 15,82 · 10,45 | 4,5 |
| on-primary / primary | 12,36 | 15,26 | 4,5 |
| on-accent / accent («Siguiente pendiente», filtro Pend.) | 9,76 | 9,76 | 4,5 |
| accent-edge / surface (borde del botón ámbar) | 4,10 | 9,05 | 3 |
| texto AP · RZ · N/A / surface (botón sin marcar) | 6,16 · 6,65 · 7,12 | 7,61 · 7,55 · 8,15 | 4,5 |
| on-state / relleno AP · RZ · N/A (marcado) | 6,16 · 6,65 · 7,12 | 4,96 · 5,48 · 5,18 | 4,5 |
| relleno AP · RZ · N/A / surface (indicador de estado) | 6,16 · 6,65 · 7,12 | 3,46 · 3,12 · 3,31 | 3 |
| relleno RZ / rz-tint (RZ marcado dentro de un control RZ) | 5,45 | 3,10 | 3 |
| chip AP · RZ · N/A · pend · sync / su fondo | 5,30 · 5,45 · 5,89 · 6,60 · 7,24 | 6,32 · 6,78 · 6,71 · 7,53 · 7,27 | 4,5 |
| pend / surface (número del filtro, «faltan») | 7,41 | 9,05 | 4,5 |
| foco / surface · anillo `--hl-ring` / surface | 12,36 · 4,10 | 9,05 · 9,05 | 3 |
| toast: texto · acción · ok · err · info | 15,04 · 7,94 · 9,74 · 6,63 · 7,87 | 15,26 · 10,50 · 5,24 · 5,65 · 7,32 | 4,5 / 3 |
| toast warn (borde e ícono, no texto) | 7,94 | 3,49 | 3 |
| etiqueta de planilla: blanco / `--tag` | 12,36 | 8,90 | 4,5 |

**Indicador de red sobre el header:**
- Ícono verde `#6EE7A0`: 8,00 / 10,25.
- Ícono gris `#C3CCD7`: 7,62 / 9,75.
- Píldora clara `#E4ECF7` con texto `#1D3557`: 10,38. Contra el header: 10,38 / 13,29.
- Píldora roja `#C2333B` con texto blanco: 5,48, con borde blanco contra el header (12,36 / 15,82).

**Limitación conocida.** AP y RZ rellenos tienen casi la misma luminancia (1,08:1 en claro, 1,11:1 en oscuro). Por eso los estados **nunca** se distinguen sólo por color: cada uno lleva ícono y texto en el botón, una franja de forma distinta (4 px lisa, 8 px con tinte, 4 px punteada) y la palabra del estado al principio de la línea de resumen.

---

### 2. Base: `<head>`, tipografía, espacio, interacción

#### 2.1 `<head>` (igual en `apps-script/Index.html`)

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#1D3557">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#142338">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PIE">
<title>PIE · Carga</title>
<script>try{var t=JSON.parse(localStorage.getItem('pie.theme')||'"auto"');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
```

- Nunca se usa `maximum-scale` ni `user-scalable=no`.
- **`applyTheme(t)`** (con `t` = `'auto'`, `'light'` o `'dark'`):
  - hace `LS.set('theme', t)`;
  - pone o saca `data-theme`;
  - si el tema es forzado, pone en los dos `meta[name=theme-color]` el color del header de ese tema (`#1D3557` o `#142338`); con `auto` restaura `#1D3557` y `#142338` respectivamente.
- **Manifest:** `"background_color": "#1D3557"`. `theme_color` no cambia. **No** se agrega `"id"`.

#### 2.2 Escala tipográfica (6 pasos)

| Paso | Tamaño / peso / interlineado | Uso exclusivo |
|---|---|---|
| Separador | 13 / 700 / 1.2, MAYÚSCULAS, tracking .06em | `h2.sec` y nombre de etapa en la banda |
| Meta | 14 / 400 / 1.4 (600 en rótulos y chips) | Método e instrumento, ayudas, chips, rótulos de campo, subtítulo del header, indicador, `.filled` |
| Cuerpo | 16 / 400 / 1.45 (botones 16 / 600) | Texto general, **todos los campos**, títulos de fila (16 / 700) |
| Trabajo | 17 / 400 / 1.4 · 17 / 700 | Criterio · título del header, tarea, AP/RZ/N/A, botones grandes, `textarea` de observaciones (17 / 400) |
| Display | 20 / 700 / 1.2 | Número de cada filtro, título de hojas y modales, `.sum-el` |

- `body{font:16px/1.45 var(--font)}`.
- Contadores, fechas, `3/46` y N° de FUM llevan `font-variant-numeric:tabular-nums`.
- Códigos de plano, revisiones y número de planilla van en `var(--mono)`.
- Se elimina `text-transform:uppercase` de `label.f>span`, del rótulo de fotos y de cualquier lugar que no sea `h2.sec` ni la banda de etapa.
- Los textos que vienen del Excel (planillas, criterios, instrumentos, nombres) se muestran **tal cual**: nunca `lowercase` ni `capitalize`.
- Mínimo de 14 px para todo texto con información.

#### 2.3 Espaciado, radios, sombras, capas

- **Espaciado:** 4 / 8 / 12 / 16 / 24 / 32.
- **`main`:** `max-width:760px; margin:0 auto; padding:12px var(--gutter) 32px`.
- **Radios:**

| Radio | Uso |
|---|---|
| 6 | Etiquetas rectangulares (revisión, planilla, FUM) y miniaturas |
| 10 | Botones, campos, filtros y avisos |
| 14 | Tarjetas y hojas |
| 999 | Chips de estado e indicador de red |

  Regla de forma: **pastilla = estado**, **rectángulo = identificador**.
- **Sombras:** `--sh-1` en tarjetas, `--sh-bar` en la barra inferior, `--sh-pop` en el toast y las hojas. En oscuro, las tarjetas sólo llevan borde `--line`.
- **Capas (z-index):**

| Capa | z-index |
|---|---|
| Banda de etapa | 10 |
| Barra inferior | 25 |
| Header | 30 |
| Modal y `ask` | 50 |
| Toast | 60 |

#### 2.4 Interacción base (P0)

```css
html{-webkit-tap-highlight-color:transparent;overscroll-behavior-y:none;background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 var(--font);-webkit-text-size-adjust:100%;min-height:100vh}
button,input,select,textarea{font:inherit;color:inherit}
button,.row,label.btn,summary{touch-action:manipulation;-webkit-user-select:none;user-select:none;cursor:pointer}
button,.btn,.row{transition:transform 80ms,filter 80ms}
button:active,.btn:active,label.btn:active{transform:scale(.97);filter:brightness(.92)}
.row:active{transform:scale(.99)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
header.top :focus-visible{outline-color:#F5B000}
.sr-only{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.ic{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ic-24{width:24px;height:24px}
.ic-16{width:16px;height:16px}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){
  .net.busy .ic{animation:none}
  .toast,.bbar,.more .ic,.fold .chev{transition:none}
  button:active,.btn:active,.row:active{transform:none}
}
```

Al arrancar, el JS hace tres cosas:

1. `document.addEventListener('touchstart', function(){}, {passive:true})`. Sin esto, iOS no aplica `:active`.
2. `var RM = matchMedia('(prefers-reduced-motion: reduce)')`. Todo `scrollTo` o `scrollIntoView` usa `behavior: RM.matches ? 'auto' : 'smooth'`.
3. `try { history.scrollRestoration = 'manual'; } catch (e) {}`.

`touch-action:manipulation` convierte un doble toque en dos clicks. Sale **junto** con el bloqueo de §6.1, nunca antes.

---

### 3. Íconos: sprite SVG en línea (P1)

**Dónde va.** Primer hijo de `<body>`. Los trazados fueron renderizados y verificados; son sencillos y se pueden retocar a ojo.

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
<symbol id="i-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>
<symbol id="i-chev-r" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></symbol>
<symbol id="i-chev-d" viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></symbol>
<symbol id="i-arrow-d" viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L19.5 7"/></symbol>
<symbol id="i-check2" viewBox="0 0 24 24"><path d="M2 12.5l4.5 4.5L15 8.5M11 16l1 1 9.5-9.5"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-minus" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-pencil" viewBox="0 0 24 24"><path d="M4 20h4L18.5 9.5l-4-4L4 16z"/><path d="M13 7l4 4"/></symbol>
<symbol id="i-camera" viewBox="0 0 24 24"><path d="M3 8.5h3.5L8.5 5h7l2 3.5H21V19H3z"/><circle cx="12" cy="13" r="3.5"/></symbol>
<symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15.5l-5-5L6 19"/></symbol>
<symbol id="i-doc" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></symbol>
<symbol id="i-settings" viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></symbol>
<symbol id="i-cloud-ok" viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 12 3.3 3.3 0 0 0 7 18.5z"/><path d="M9.5 14.5l2 2 3.5-3.5"/></symbol>
<symbol id="i-cloud-up" viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 12 3.3 3.3 0 0 0 7 18.5z"/><path d="M12 17v-5M9.5 14l2.5-2.5 2.5 2.5"/></symbol>
<symbol id="i-cloud-off" viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 12 3.3 3.3 0 0 0 7 18.5z"/><path d="M3 3l18 18"/></symbol>
<symbol id="i-sync" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3l1.7-1.8M20 20v-4.5h-4.5"/></symbol>
<symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 3.5L22 20.5H2z"/><path d="M12 10v4.5M12 17.5v.01"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></symbol>
<symbol id="i-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>
<symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></symbol>
<symbol id="i-ext" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol>
<symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></symbol>
</svg>
```

**Helper JS.**

```js
function ic(n, c) { return '<svg class="ic ' + (c || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + n + '"/></svg>'; }
```

**Reemplazos obligatorios.** Al terminar, no queda ninguno de estos glifos en el HTML que genera el JS.

| v1.5 | v1.6 |
|---|---|
| ‹ (l.1157) | `i-back`, 24 px |
| › (l.858, 1208, 1242, 1281, 1661) | `i-chev-r`, color `--muted` |
| ▾ ▸ (l.865, 1216, 1476) | `i-chev-d`; rota −90° si está plegado |
| ⋯ / ▴ (l.1560) | `i-chev-d`; rota 180° si está abierto |
| ⚙︎ (l.1160) | `i-settings` |
| ＋ (l.1254, 1447) | `i-plus` |
| 📷 (l.923, 1550, 1575) | `i-camera` |
| 🖼 (l.1576) | `i-image` |
| ⏳ / ⚠ en miniaturas (l.928) | `i-clock` / `i-alert` **dentro del `<i>`** (la E2E usa `.thumbs .t i`) |
| ⚠ en chips y notas (l.711, 1239, 1279) | `i-alert`, 16 px |
| ✕ (l.581) | `i-x` |
| ↓ de «Siguiente pendiente» | `i-arrow-d` |

---

### 4. Componentes

#### 4.1 Header (`header.top#top`)

**Marcado.**

```html
<header class="top" id="top">
  [<button class="back" data-act="back" aria-label="Volver">ic('back','ic-24')</button>]   <!-- no en Inicio ni en «Sin datos» -->
  <div class="ttl"><b>{título}</b><small>{subtítulo}</small></div>
  <button class="net …" data-act="net" …>…</button>                                    <!-- §4.2 -->
  [<button class="icon-btn" data-act="go" data-to="/ajustes" aria-label="Ajustes">ic('settings','ic-24')</button>]
</header>
```

**CSS.**

```css
header.top{position:sticky;top:0;z-index:30;box-sizing:border-box;height:var(--hdr-h);display:flex;align-items:center;gap:4px;
  padding:env(safe-area-inset-top) max(8px,env(safe-area-inset-right)) 0 max(8px,env(safe-area-inset-left));
  background:var(--brand);color:var(--on-brand);border-bottom:1px solid var(--hdr-line)}
header.top::before{content:"";position:absolute;left:0;right:0;bottom:100%;height:100vh;background:var(--brand)}
header.top .back,header.top .icon-btn{width:48px;height:48px;flex:none;display:grid;place-items:center;border:0;background:transparent;color:inherit;border-radius:var(--r-md)}
header.top .back:active,header.top .icon-btn:active{background:rgba(255,255,255,.14)}
header.top .ttl{flex:1;min-width:0;padding:0 4px}
header.top .ttl:first-child{padding-left:8px}
header.top .ttl b{display:block;font-size:17px;line-height:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header.top .ttl small{display:block;font-size:14px;line-height:18px;color:var(--brand-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
header.top .ttl small:empty{display:none}
```

- **Engranaje:** sólo en Inicio (`/`), en «Sin datos» y en FUM (`/fum`). Se saca de Planilla, Nuevo, Registro, ¿Quién sos? y Ajustes, para dejarle lugar al título. Ajustes queda accesible desde Inicio, desde FUM y desde el indicador cuando hay error.
- **Títulos:** ver §7.1.

#### 4.2 Indicador de envíos (`button.net`, P0)

**Marcado.** `.lbl` y `.cnt` siempre están en el DOM; la E2E lee `textContent`.

```html
<button class="net {estado}{ q}" data-act="net" aria-label="{aria}">
  ic(icono)<span class="lbl">{texto}</span>[<span class="cnt">{n}</span>]
</button>
```

**CSS.**

```css
.net{position:relative;flex:none;display:flex;align-items:center;gap:6px;height:36px;padding:0 12px 0 10px;border-radius:var(--r-pill);
  border:1px solid var(--net-line);background:transparent;color:#FFFFFF;font-size:14px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.net::before{content:"";position:absolute;inset:-6px -2px}            /* área táctil de 48 px sin ensanchar */
.net .ic{width:18px;height:18px}
.net.ok .ic{color:var(--net-ok)}
.net.off .ic,.net.weak .ic{color:var(--net-off)}
.net.q{background:var(--net-q-bg);border-color:var(--net-q-bg);color:var(--net-q-ink)}
.net.q .ic{color:var(--net-q-ink)}
.net.err,.net.fix{background:var(--net-err);border-color:#FFFFFF;color:#FFFFFF}
.net.err .ic,.net.fix .ic{color:#FFFFFF}
.net.busy .ic{animation:spin 1s linear infinite}
@media (max-width:359px){ .net .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap} .net{padding:0 10px} }
```

**Datos.**
- `n = pendingChanges()`. Cuenta **cambios**, no operaciones, sobre las operaciones con `status !== 'error'`:

| Operación | Aporta |
|---|---|
| `create` | 1 + controles de `op.items` con algún campo distinto de `documento` |
| `update` | `Object.keys(op.items \|\| {}).length` o 1 |
| `photo` | 1 |
| `fum` | 1 |

- `nErr` = operaciones con `status === 'error'`.
- `online = IN_GAS || navigator.onLine`.
- `S.lastErrorCode` es nuevo, sólo en memoria: se carga en el `catch` de `sync()` con `e.code` y se limpia junto con `S.lastError`.

**Estados.** Se evalúan en orden; gana la primera condición que se cumple.

| # | Condición | Clases | Ícono | `.lbl` + `.cnt` | Al tocar |
|---|---|---|---|---|---|
| 1 | `S.syncing` | `busy` (+`q` si n>0) | `sync` girando | `Enviando… · ` + n, o `Actualizando…`. A los 15 s en ese estado: `Señal débil · ` + n | nada |
| 2 | `lastErrorCode` es `auth` o `config` | `fix` | `alert` | `Revisar conexión` | `nav('/ajustes')` y desplaza a `#conexion` |
| 3 | nErr > 0 | `err` | `alert` | `Con error · ` + nErr | `nav('/ajustes')` y desplaza a `#envios` |
| 4 | `!online` | `off` (+`q` si n>0) | `cloud-off` | `Sin señal · ` + n, o `Sin señal` | toast info (§7.4) |
| 5 | `online && S.lastError` | `weak` (+`q` si n>0) | `cloud-off` | `No conecta · ` + n, o `No conecta` | `sync({manual:true})` |
| 6 | n > 0 | `pend q` | `cloud-up` | `Sin enviar · ` + n | `sync({manual:true})` |
| 7 | resto | `ok` | `cloud-ok` | `Al día` | `sync({full:true, manual:true})` |

- **`aria-label`:** `'Envíos: ' + lbl + (n ? n + (n === 1 ? ' cambio' : ' cambios') : '')`. Contiene el texto visible (WCAG 2.5.3).
- **Atributos:** sin `title`.
- **Envíos automáticos exitosos:** no generan aviso; la confirmación es el paso a «Al día».

#### 4.3 Botones

```css
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 16px;border-radius:var(--r-md);
  border:1.5px solid var(--border-strong);background:var(--surface);color:var(--ink);font-size:16px;font-weight:600;line-height:1.2;text-align:center}
.btn.primary{background:var(--primary);border-color:var(--primary);color:var(--on-primary)}
.btn.danger{background:var(--rz-fill);border-color:var(--rz-fill);color:var(--on-state)}
.btn.ap{background:var(--ap-fill);border-color:var(--ap-fill);color:var(--on-state)}
.btn.ap-line{color:var(--ap);border-color:var(--ap)}
.btn.ghost{background:transparent;border-color:transparent}
.btn.ghost.danger{color:var(--rz)}
.btn.sm{font-size:14px;padding:0 12px}
.btn.lg{min-height:56px;font-size:17px;font-weight:700}
.btn.block{display:flex;width:100%}
.btn:disabled{opacity:.45}
.icon-btn{width:48px;height:48px;flex:none;display:grid;place-items:center;border:0;background:transparent;color:var(--ink);border-radius:var(--r-md)}
.icon-btn:active{background:var(--surface-2)}
```

- Hay al menos 8 px entre objetivos vecinos.
- Entre una acción destructiva y la principal hay al menos 24 px.

#### 4.4 Campos (P0 los tamaños; P1 el resto)

```css
.in,.search{box-sizing:border-box;width:100%;min-height:48px;padding:12px 14px;border-radius:var(--r-md);border:1.5px solid var(--border-strong);
  background:var(--surface);color:var(--ink);font-size:16px;line-height:1.3}
textarea.in{min-height:96px;font-size:17px;line-height:1.4;resize:vertical}
.in::placeholder,.search::placeholder{color:var(--placeholder);opacity:1}
.in:focus,.search:focus{outline:none;border-color:var(--focus);box-shadow:0 0 0 3px var(--focus-ring)}
select.in{-webkit-appearance:none;appearance:none;padding-right:40px;background:var(--surface) var(--sel-chev) no-repeat right 12px center/20px}
input[type=date].in{display:block;-webkit-appearance:none;appearance:none;min-width:0;text-align:left}
input[type=date].in::-webkit-date-and-time-value{text-align:left}
.grid2,.grid3{display:grid;gap:0 12px}
.grid2{grid-template-columns:1fr 1fr}
.grid3{grid-template-columns:1fr 1fr 1fr}
@media (max-width:380px){.grid3{grid-template-columns:1fr 1fr}}
.grid2>*,.grid3>*{min-width:0}
label.f{display:block;margin-bottom:12px}
label.f>span{display:block;margin-bottom:6px;font-size:14px;font-weight:600;color:var(--muted)}
fieldset{border:0;margin:0;padding:0;min-width:0}
legend{padding:0;margin-bottom:8px;font-size:14px;font-weight:600;color:var(--muted)}
.help{font-size:14px;line-height:1.4;color:var(--muted);margin:6px 0 0}
.search-box{position:relative}
.search-box .ic{position:absolute;left:14px;top:14px;color:var(--muted);pointer-events:none}
.search-box .search{padding-left:44px}
.field-err{display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-size:14px;color:var(--rz)}
```

**Atributos de teclado (eng-15):**

| Campo | Atributos |
|---|---|
| `name=documento`, buscador `docq` y Piso | `autocapitalize="characters" autocorrect="off" spellcheck="false" autocomplete="off"` |
| Elemento y Sector | `autocapitalize="sentences" autocorrect="off"` |
| Observaciones y detalle de la acción inmediata | `autocapitalize="sentences" enterkeyhint="done"` |
| Buscadores | `type="search" enterkeyhint="search"`; Enter hace `blur()` |
| Enlace y clave de Ajustes | `autocapitalize="off" autocorrect="off" spellcheck="false"` |

#### 4.5 Chips, etiquetas, avatar y barra de progreso

```css
.chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 10px;border-radius:var(--r-pill);font-size:14px;font-weight:600;line-height:1.3;
  background:var(--na-bg);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip .ic{width:16px;height:16px}
.chip.ap{background:var(--ap-bg);color:var(--ap)}
.chip.rz{background:var(--rz-bg);color:var(--rz)}
.chip.pend{background:var(--pend-bg);color:var(--pend)}
.chip.sync{background:var(--sync-bg);color:var(--sync)}
button.chip{min-height:44px;padding:0 12px;border:1.5px solid currentColor}
.chips,.warn{display:flex;flex-wrap:wrap;gap:6px 8px;margin-top:8px}
.warn .chip{white-space:normal}
.tag{display:inline-flex;align-items:center;justify-content:center;padding:2px 6px;border-radius:var(--r-sm);font:700 14px/1.3 var(--mono);border:1.5px solid currentColor;color:var(--brand)}
:root[data-theme=dark] .tag{color:var(--sync)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .tag{color:var(--sync)}}
.tag.solid{min-width:36px;min-height:28px;border:0;background:var(--tag);color:var(--on-tag)}
.tag.fum{border:0;background:var(--rz-fill);color:var(--on-state);font-family:var(--font)}
.tag.fum.new{background:var(--sync-bg);color:var(--sync)}
.avatar{width:40px;height:40px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--na-bg);color:var(--ink);font-size:14px;font-weight:700}
.meta{font-size:14px;line-height:1.4;color:var(--muted);margin:2px 0 0}
.bar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;background:var(--surface);box-shadow:inset 0 0 0 1px var(--border-strong)}
.bar i{display:block;height:100%;flex:none}
.bar .rz{background:var(--rz-fill)}
.bar .ap{background:var(--ap-fill)}
.bar .na{background:repeating-linear-gradient(135deg,var(--na-fill) 0 3px,transparent 3px 6px);box-shadow:inset 0 0 0 1px var(--na-fill)}
.bar.mini{width:48px;height:4px;gap:1px;box-shadow:none;background:var(--line)}
.bar-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.bar-row .bar{flex:1}
.bar-row .n{font-size:14px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
```

**Chips.** Sólo para estados: AP, RZ, faltan N, Sin iniciar, Completo, Sin enviar, Plano superado, vigente, no vigente, Vencida, Sin fecha de reinspección, Abierta, Oculta, vos y Falta N° de serie. Los metadatos (piso, rubro, fecha, «Muestra 100%», cantidad de registros) van como `.meta` separados por ` · `.

**Etiqueta de revisión.** `revLabel(rev)` devuelve `''` como `'Sin rev.'`, un dígito suelto como `'R0' + rev` y cualquier otro valor como `'R' + rev`. Es el mismo formato que `docRef`.

**Barra de progreso.**
- Marcado: `<div class="bar" aria-hidden="true"><i class="rz" style="width:{%}"></i><i class="ap" style="width:{%}"></i><i class="na" style="width:{%}"></i></div>`.
- Orden de los segmentos: **RZ, AP, N/A**. Lo pendiente queda como hueco.
- El `style="width:…"` de estos segmentos es el **único** `style=` permitido en el JS.

#### 4.6 Tarjeta de control (`.item`, P0)

**Marcado.** Todo lo que aparece al marcar va **debajo** de `.acts`, así los botones no se corren bajo el dedo.

```html
<div class="item {pend|ap|rz|na}{ kept}" id="it-{off}">
  <p class="crit" id="crit-{off}">{criterio}</p>
  <p class="meta">{[metodo, instrumento≠'NA'].join(' · ')}</p>
  <div class="acts{ set}" role="group" aria-label="Resultado del control">
    <button class="st ap{ on}" data-act="mark" data-key="{key}" data-off="{off}" data-st="ap" aria-pressed="{bool}" aria-describedby="crit-{off}">ic('check')AP</button>
    <button class="st rz{ on}" … data-st="rz" …>ic('x')RZ</button>
    <button class="st na{ on}" … data-st="na" …>ic('minus')N/A</button>
    <button class="more{ has}" data-act="more" data-key="{key}" data-off="{off}" aria-expanded="{bool}" aria-controls="det-{off}"
            aria-label="Detalle del control{, n fotos}{, con observación}">ic('chev-d')</button>
  </div>
  [<p class="filled">…</p>]          <!-- sólo si hay datos y el detalle está cerrado -->
  [<div class="warn">…</div>]
  [<div class="det" id="det-{off}" data-key data-off>…</div>]
</div>
```

**CSS.**

```css
.task{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-1);margin-bottom:12px;overflow:hidden}
.item{position:relative;padding:12px 12px 14px 16px;border-top:1px solid var(--line)}
.task-h+.item{border-top:0}
.item::before{content:"";position:absolute;left:0;top:0;bottom:0;width:0}
.item.ap::before{width:4px;background:var(--ap-fill)}
.item.rz{background:var(--rz-tint)}
.item.rz::before{width:8px;background:var(--rz-fill)}
.item.na::before{width:4px;background:repeating-linear-gradient(180deg,var(--na-fill) 0 4px,transparent 4px 8px)}
.item.kept .crit,.item.kept .meta{opacity:.6}
.crit{margin:0;font-size:17px;line-height:1.4;white-space:pre-line;overflow-wrap:anywhere}
.acts{display:flex;gap:12px;margin-top:12px}
.st{flex:1;min-width:0;min-height:56px;display:flex;align-items:center;justify-content:center;gap:6px;border:1.5px solid var(--border-strong);
  border-radius:var(--r-md);background:var(--surface);font-size:17px;font-weight:700}
.st .ic{width:18px;height:18px}
.st.ap{color:var(--ap)}
.st.rz{color:var(--rz)}
.st.na{color:var(--na)}
.st.on{color:var(--on-state)}
.st.ap.on{background:var(--ap-fill);border-color:var(--ap-fill)}
.st.rz.on{background:var(--rz-fill);border-color:var(--rz-fill)}
.st.na.on{background:var(--na-fill);border-color:var(--na-fill)}
.acts.set .st:not(.on){color:var(--muted)}
.more{flex:none;width:52px;min-height:56px;margin-left:4px;position:relative;display:grid;place-items:center;border:1.5px solid var(--border-strong);
  border-radius:var(--r-md);background:var(--surface);color:var(--muted)}
.more .ic{transition:transform .15s}
.more[aria-expanded=true]{border-color:var(--focus);color:var(--ink)}
.more[aria-expanded=true] .ic{transform:rotate(180deg)}
.more.has::after{content:"";position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--sync)}
.filled{margin:10px 0 0;font-size:14px;line-height:1.4;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.t-ap{color:var(--ap)} .t-rz{color:var(--rz)} .t-na{color:var(--na)} .t-sync{color:var(--sync)}
.hl{outline:3px solid var(--hl-ring);outline-offset:-3px}
@media (max-width:359px){
  .acts{gap:8px}
  .more{width:48px;margin-left:2px}
  .st .ic{display:none}
  .item{padding:12px 10px 14px 14px}
}
```

**Anchos resultantes de cada botón de estado:** unos 65 px en 320, 79 en 390 y 86 en 412. Todos de 56 px de alto, con 12 px de separación (8 px por debajo de 360) y 16 px antes del botón de detalle.

**Reglas.**
- `.acts.set` va cuando el control tiene estado.
- `.more.has` va si hay fotos u observación.
- **`.filled`** se arma así:

```
[<b class="t-{st}">AP|RZ|N/A</b> (sólo si hay estado), fumTxt, fmtDate(fecha), resp, 'Plano: X' (si difiere del plano del registro), n + (n === 1 ? ' foto' : ' fotos')].join(' · ')
  + (obs ? ' · “' + obs + '”' : '')
```

  donde `fumTxt` vale:
  - `'FUM ' + num + ' abierta'` (texto literal; lo usa la E2E en la línea 117);
  - `'FUM ' + num + ' ' + estado.toLowerCase()`;
  - `'FUM nueva (sin enviar)'`;
  - `'FUM ' + it.fum` (si sólo hay número manual).
- **`.warn`:**
  - Si es AP o RZ y `needsSerial`: `<button class="chip pend" data-act="serial" data-key data-off>Falta N° de serie</button>`.
  - `docWarnHtml` nivel `bad`: `<span class="chip rz">ic('alert','ic-16')Marcado con R{u}; ya regía R{l}</span>`.
  - Nivel `later`: `<p class="help">Después de este control salió la R{l}</p>`.
- **`.hl`:** se agrega y se saca con `setTimeout` a los 1500 ms. Se borran `@keyframes hl` y `#fff4c2`.

#### 4.7 Detalle (`.det`) y FUM (`.fumbox`) (P1 el aplanado; P0 la lógica)

```css
.det{margin:12px -12px -14px -16px;padding:16px 12px 16px 16px;background:var(--surface-2);border-top:1px solid var(--line)}
@media (max-width:359px){.det{margin:12px -10px -14px -14px;padding:16px 10px 16px 14px}}
.det .sec+.sec{margin-top:16px}
.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
.thumbs .t{position:relative;width:64px;height:64px;border-radius:var(--r-sm);overflow:hidden;background:var(--na-bg);display:grid;place-items:center;border:0;padding:0;color:var(--muted)}
.thumbs .t img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.thumbs .t i{position:absolute;right:3px;bottom:3px;display:grid;place-items:center;width:20px;height:20px;border-radius:var(--r-sm);background:rgba(0,0,0,.6);color:#FFFFFF;font-style:normal}
.thumbs .t i .ic{width:14px;height:14px}
.file-btn{position:relative;overflow:hidden}
.file-btn input{position:absolute;inset:0;opacity:0;width:100%}
.fumbox{border-left:3px solid var(--rz);padding-left:12px}
.fumbox.ok{border-left-color:var(--ap)}
.fum-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.fum-h b{font-size:17px;font-weight:700}
.quick{display:flex;gap:8px;flex-wrap:wrap;margin-top:-4px}
.det-foot{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:16px}
.det-foot .primary{flex:0 1 60%;min-height:56px;font-size:17px;font-weight:700}
```

**Orden del contenido.**

1. **FUM**, si existe:
   ```html
   <section class="sec fumbox{ ok}">
     <div class="fum-h"><b>{num ? 'FUM N° ' + num : 'FUM nueva'}</b>{chip}</div>
     [<p class="meta">Abierta el {dd/mm/aa}{ · cerrada el …}{ · resultado}</p>]
     [si está abierta:]
     <label class="f"><span>Acción inmediata</span><select class="in" data-fum="accionInmediata">…</select></label>
     <label class="f"><span>Detalle de la acción inmediata</span><input class="in" data-fum="accionCorrectiva" placeholder="Ej.: rehacer recubrimiento" autocapitalize="sentences" enterkeyhint="done"></label>
     <label class="f"><span>Fecha de reinspección</span><input class="in" type="date" data-fum="plazo"></label>
     [P2 <div class="quick"><button class="btn sm" data-act="plazo" data-d="1">Mañana</button><button … data-d="3">+3 días</button><button … data-d="7">+1 semana</button></div>]
     [si no hay plazo: <span class="chip pend">Sin fecha de reinspección</span>]
     <p class="help">Se cierra sola cuando marques AP en la reinspección.</p>
   </section>
   ```
   - **Chip según la situación:**

     | Situación | Chip |
     |---|---|
     | Abierta sin número | `.sync` «N° al enviar» |
     | Abierta con número | `.rz` «Abierta» |
     | Cierre en cola | `.pend` «Se cierra al enviar» o «Se anula al enviar» |
     | Cerrada | `.ap` «Cerrada» |
     | Anulada | neutro «Anulada» |

   - **Opciones del select:**
     - con valor vacío: `value=""` «Elegí una»;
     - `Reparar`, `Recambio`, `Recalificar`;
     - `<option value="Dejar como esta">Dejar como está</option>`.

     `selected` se compara contra el `value`.
   - **Atajos de fecha (P2):** calculan `today() + d` y llaman a `editFum`. Nunca se carga un plazo por defecto.
2. **Fotos:**
   ```html
   <fieldset class="sec"><legend>Fotos{ · n}</legend>
     <div class="thumbs">{photoThumbs}</div>
     <div class="grid2">
       <label class="btn file-btn">ic('camera')Cámara<input type="file" accept="image/*" capture="environment" data-photo="1" data-key data-off></label>
       <label class="btn file-btn">ic('image')Galería<input type="file" accept="image/*" multiple data-photo="1" data-key data-off></label>
     </div>
   </fieldset>
   ```
   - **Miniaturas del servidor:**
     ```html
     <a class="t" href="{url}" target="_blank" rel="noopener" aria-label="Ver foto en Drive">ic('image')[img]</a>
     ```
     El `img` a `drive.google.com/thumbnail` sólo se agrega si `navigator.onLine`.
   - **Miniaturas locales:**
     ```html
     <button class="t" data-act="rmphoto" data-id aria-label="Foto sin enviar. Tocá para quitarla.">[img]<i>ic(o.status === 'error' ? 'alert' : 'clock')</i></button>
     ```
3. **Observaciones:** `<label class="f"><span>Observaciones</span><textarea class="in" data-field="obs" autocapitalize="sentences">`.
4. **Datos del control:**
   ```html
   <div class="sec"><div class="grid2">
     <label class="f"><span>Fecha</span><input class="in" type="date" data-field="fecha">[<p class="help">Vacía = hoy al marcar</p>]</label>
     <label class="f"><span>Resp.</span><select class="in" data-field="resp"><option value="">Sin responsable</option>…</select></label>
   </div>
   {instrSelect}   <!-- rótulo «Instrumento», y si needsSerial agrega « · elegí el N° de serie» -->
   [<p class="help">Plano de este control: <span class="mono">{doc}</span></p>]
   [<label class="f"><span>FUM N°</span><input class="in" data-field="fum" inputmode="numeric"></label>]   <!-- SÓLO si it.fum tiene valor y no hay FUM en cola ni en el servidor -->
   </div>
   ```
5. **Pie:**
   ```html
   <div class="det-foot">
     [<button class="btn ghost danger" data-act="clear" data-key data-off>Borrar carga</button>]   <!-- sólo si el control tiene estado, fecha, resp., FUM u observaciones -->
     <button class="btn primary" data-act="more" data-key data-off>ic('check')Listo</button>
   </div>
   ```
   Si no hay «Borrar carga», «Listo» va a la derecha con `margin-left:auto`.

#### 4.8 Filtros (`.filters`, P1)

```html
<div class="filters" role="group" aria-label="Filtrar controles">
  <button class="f-all{ on}{ zero}" data-act="filter" data-key data-f="all" aria-pressed><b>46</b><span>Todos</span></button>
  <button class="f-pend…" data-f="pend"><b>43</b><span>Pend.</span></button>
  <button class="f-ap…" data-f="ap"><b>1</b><span>AP</span></button>
  <button class="f-rz…" data-f="rz"><b>1</b><span>RZ</span></button>
  <button class="f-na…" data-f="na"><b>1</b><span>N/A</span></button>
</div>
```

```css
.filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:12px 0 8px}
.filters button{min-height:56px;padding:4px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  border:1.5px solid var(--border-strong);border-radius:var(--r-md);background:var(--surface);min-width:0}
.filters b{font-size:20px;line-height:1.1;font-weight:700;font-variant-numeric:tabular-nums}
.filters span{font-size:14px;font-weight:600;color:var(--muted)}
.f-all b{color:var(--ink)} .f-pend b{color:var(--pend)} .f-ap b{color:var(--ap)} .f-rz b{color:var(--rz)} .f-na b{color:var(--na)}
.filters .zero b{color:var(--muted)}
.filters .on b,.filters .on span{color:inherit}
.f-all.on{background:var(--primary);border-color:var(--primary);color:var(--on-primary)}
.f-pend.on{background:var(--accent);border-color:var(--accent-edge);color:var(--on-accent)}
.f-ap.on{background:var(--ap-fill);border-color:var(--ap-fill);color:var(--on-state)}
.f-rz.on{background:var(--rz-fill);border-color:var(--rz-fill);color:var(--on-state)}
.f-na.on{background:var(--na-fill);border-color:var(--na-fill);color:var(--on-state)}
```

- En el SE (296 px útiles) cada celda mide 56 px; en 390, unos 68. No hay desplazamiento horizontal.
- El selector de planos ya no usa `.filters` (§4.13).

#### 4.9 Banda de etapa, tarea y acciones masivas (P1)

```html
<div class="stage{ done}" data-stage="{PRE}">
  <div class="stage-h"><button class="fold" data-act="fold" data-k="{key|PRE}" aria-expanded="{bool}">
    ic('chev-d','chev')<span class="st-name">{PRE}</span><span class="st-cnt">{hechos}/{total}</span>{bar.mini}
  </button></div>
  <div class="card task">
    <div class="task-h"><h3>{tarea tal cual}</h3>[<span class="meta">Muestra {x}</span>]
      [P2 <button class="btn sm na-task" data-act="taskna" data-key data-stage data-task>ic('minus')N/A a la tarea</button>]</div>
    …items…
  </div>
  [<button class="btn block ap-line bulk" data-act="bulk" data-key data-stage>ic('check2'){texto §7.5}</button>]
</div>
```

```css
.stage{margin-top:8px}
.stage-h{position:sticky;top:var(--hdr-h);z-index:10;margin:0 calc(-1*var(--gutter)) 8px;padding:0 var(--gutter);background:var(--bg);border-bottom:1px solid var(--line)}
.stage-h .fold{width:100%;min-height:48px;display:flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--ink);padding:0}
.fold .chev{transition:transform .15s}
.fold[aria-expanded=false] .chev{transform:rotate(-90deg)}
.st-name{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.st-cnt{font-size:14px;font-weight:600;color:var(--pend);font-variant-numeric:tabular-nums}
.stage.done .st-cnt{color:var(--ap)}
.task-h{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:12px 12px 8px 16px;background:var(--surface-2);border-bottom:1px solid var(--line)}
.task-h h3{margin:0;flex:1 1 60%;min-width:0;font-size:17px;font-weight:700;line-height:1.3}
.task-h .meta{margin:0}
.na-task{color:var(--na)}
.bulk{margin:0 0 16px}
```

- **«Aprobar pendientes» (`.bulk`):** va al final de la etapa. Se muestra sólo si `gs.pend > 0`, la etapa no está plegada y el filtro es `all` o `pend`. Con el filtro AP, RZ o N/A no se muestra, porque aprobaría controles que no se ven (C17).
- **«N/A a la tarea» (P2):** se muestra sólo si la tarea tiene 2 o más pendientes y el filtro es `all` o `pend`.
- **Cabecera de tarea:** **no** es sticky (FLOW-13: header más etapa más tarea ocuparían unos 150 px fijos).

#### 4.10 Barra inferior acoplada (`.bbar`, P0; reemplaza la píldora, el FAB y el submit)

**Dónde va.** Se dibuja **dentro de `#view`** como último hijo. Después de cada `render()`: `document.body.classList.toggle('has-bbar', !!view.querySelector('.bbar'))`.

```css
.bbar{position:fixed;left:0;right:0;bottom:0;z-index:25;background:var(--surface);border-top:1px solid var(--line);box-shadow:var(--sh-bar);
  padding:8px max(var(--gutter),env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(var(--gutter),env(safe-area-inset-left));
  transition:transform .18s,visibility .18s}
.bbar-in{max-width:760px;margin:0 auto;display:flex;align-items:center;gap:8px}
body.has-bbar main{padding-bottom:calc(96px + env(safe-area-inset-bottom))}
body.kb .bbar,body.det-vis .bbar{transform:translateY(110%);visibility:hidden}
.nextpend{flex:1;min-height:56px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid var(--accent-edge);
  border-radius:var(--r-md);background:var(--accent);color:var(--on-accent);font-size:17px;font-weight:700}
.nextpend .cnt{min-width:28px;padding:2px 8px;border-radius:var(--r-pill);background:rgba(26,19,0,.14);font-size:15px;font-variant-numeric:tabular-nums}
.done-sum{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
```

**Contenido según la pantalla:**

| Pantalla | Contenido |
|---|---|
| Registro con pendientes | `<button class="nextpend" data-act="nextpend" aria-label="Ir al siguiente control pendiente (quedan {n})">ic('arrow-d')Siguiente pendiente<span class="cnt">{n}</span></button>` |
| Registro sin pendientes (FLOW-11) | `<div class="done-sum">ic('check-circle','t-ap'){rz ? 'Sin pendientes' : 'Completo'} · {ap} AP · {na} N/A · {rz} RZ</div><button class="btn" data-act="go" data-to="/c/{sheet}">Planilla {sheet}</button>` |
| Planilla, si tiene modelo | `<button class="fab btn primary lg block" data-act="go" data-to="/c/{sheet}/nuevo">ic('plus')Nuevo registro</button>`. Conserva la clase `.fab`, que ya no flota. |
| Nuevo registro | `<button type="submit" form="newForm" class="btn primary lg block">Crear registro</button>`. Es el **único** `[type=submit]` de la pantalla: se quita el del formulario. |
| Resto | Sin barra |

**Ocultamiento.**

- **Teclado.** Se detecta con `visualViewport`, **no** con `focusin`, para no ocultar la barra en la E2E:
  ```js
  var vv = window.visualViewport;
  function kbCheck() { document.body.classList.toggle('kb', !!vv && (window.innerHeight - vv.height * vv.scale) > 150); }
  if (vv) vv.addEventListener('resize', kbCheck);
  ```
- **Detalle a la vista:**
  ```js
  var detIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target._vis = e.isIntersecting; });
    document.body.classList.toggle('det-vis', [].some.call(document.querySelectorAll('.det'), function (d) { return d._vis; }));
  }) : null;
  function watchDets() { if (!detIO) return; detIO.disconnect(); document.body.classList.remove('det-vis');
    document.querySelectorAll('.det').forEach(function (d) { detIO.observe(d); }); }
  ```
  `watchDets()` se llama después de cada `render()` y de cada `refreshItem()`. No alcanza con «hay un detalle abierto»: después de un RZ el detalle queda abierto y la barra desaparecería por el resto del registro.
- El padding inferior de `main` **no cambia** al ocultar la barra, así no hay saltos.

#### 4.11 Toast (`#toast`, P0)

**Marcado** (fuera de `main`):

```html
<div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"><svg class="ic" aria-hidden="true"><use href=""/></svg><span class="msg"></span><button class="act" type="button" hidden></button></div>
```

**CSS.**

```css
.toast{position:fixed;z-index:60;left:var(--gutter);right:var(--gutter);margin:0 auto;max-width:520px;top:calc(var(--hdr-h) + 8px);
  display:flex;align-items:center;gap:10px;min-height:48px;box-sizing:border-box;padding:10px 14px;border-radius:var(--r-md);
  background:var(--toast-bg);color:var(--toast-ink);border:1px solid var(--toast-edge);border-left:4px solid var(--k);box-shadow:var(--sh-pop);
  font-size:16px;line-height:1.35;opacity:0;visibility:hidden;transform:translateY(-8px);transition:opacity .18s,transform .18s,visibility .18s;pointer-events:none}
.toast.bottom{top:auto;bottom:calc(var(--toast-b,16px) + env(safe-area-inset-bottom));transform:translateY(8px)}
.toast.show{opacity:1;visibility:visible;transform:none}
.toast .ic{color:var(--k)}
.toast .msg{flex:1}
.toast .act{pointer-events:auto;min-height:48px;margin:-10px -8px -10px 0;padding:0 12px;border:0;background:none;color:var(--toast-act);
  font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px}
.toast.k-ok{--k:var(--k-ok)} .toast.k-err{--k:var(--k-err)} .toast.k-warn{--k:var(--k-warn)} .toast.k-info{--k:var(--k-info)}
body.has-bbar:not(.kb):not(.det-vis){--toast-b:84px}
```

**API.** `toast(msg, opts)`. `opts` puede ser un número (milisegundos, compatible con hoy) o `{kind:'ok'|'info'|'warn'|'err', ms, action:{label, icon, fn}}`. Por defecto el tipo es `info`.

| Tipo | Ícono | Duración |
|---|---|---|
| ok | `check-circle` | 4 s; +2 s si el texto pasa de 40 caracteres |
| info | `info` | 4 s; +2 s si el texto pasa de 40 caracteres |
| warn | `alert` | 6 s |
| err | `alert` | 6 s |
| con acción | según el tipo | 6 s |

- **Posición:** sin acción, **arriba** (bajo el header). Con acción, **abajo** (clase `.bottom`), sobre la barra. Así el «Deshacer» queda al alcance del pulgar.
- **Toques:** `pointer-events:none` salvo en el botón de acción. El toast nunca bloquea un toque.
- **Cola:**
  - Si el aviso visible es `err`, `warn` o tiene acción, los nuevos esperan su turno (cola de hasta 2 y sin repetir textos iguales).
  - Un `info` u `ok` se puede pisar.
- **Al tocar la acción:** ejecuta `fn` y cierra el aviso.

#### 4.12 Hoja de confirmación `ask()` (P0; reemplaza **todos** los `confirm()`)

**API.** `ask({title, body, ok:{label, tone}, alt?:{label}, cancel?:'Cancelar'})` devuelve `Promise<'ok'|'alt'|null>`, con `tone` = `'primary'`, `'ap'` o `'danger'`.

**Marcado** (se agrega a `body`, fuera de `main`):

```html
<div class="modal sheet" id="ask">
  <div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="ask-t" aria-describedby="ask-b">
    <h2 id="ask-t" tabindex="-1">{title}</h2>
    <p id="ask-b">{body}</p>
    <div class="ask-btns">
      <button class="btn lg block {primary|ap|danger}" data-ans="ok">{ok.label}</button>
      [<button class="btn lg block" data-ans="alt">{alt.label}</button>]
      <button class="btn lg block ghost" data-ans="cancel">{cancel}</button>
    </div>
  </div>
</div>
```

```css
.modal{position:fixed;inset:0;z-index:50;background:var(--scrim);display:flex;align-items:flex-end;justify-content:center}
.sheet .panel{box-sizing:border-box;width:100%;max-width:560px;max-height:88vh;max-height:88dvh;overflow:auto;background:var(--surface);
  border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px var(--gutter) max(16px,env(safe-area-inset-bottom));box-shadow:var(--sh-pop)}
.sheet h2{margin:0 0 8px;font-size:20px;line-height:1.25;font-weight:700;outline:none}
.sheet p{margin:0 0 16px;font-size:16px;line-height:1.45;white-space:pre-line}
.ask-btns{display:flex;flex-direction:column;gap:8px}
```

**Comportamiento.**
- Al abrir:
  - guarda `document.activeElement`;
  - pone `inert` en `#top` y `#view`;
  - agrega `body.modal-open{overflow:hidden}`;
  - enfoca `#ask-t`.
- **Respuestas:**
  - tocar el fondo (`e.target === modal`) o apretar Escape → `null`;
  - `data-ans=ok` → `'ok'`;
  - `data-ans=alt` → `'alt'`;
  - `data-ans=cancel` → `null`.
- Al cerrar: quita `inert`, saca la clase y devuelve el foco.
- Sus clicks **no** pasan por el manejador global de `data-act`.

#### 4.13 Selector de plano FOD 02 (`#modal`, P1; textos P0)

**Marcado.** Se conservan `id="modal"`, `.doc`, `data-act=pickdoc|pickfree|closemodal` e `input[data-input=docq]`.

```html
<div class="modal" id="modal">
 <div class="panel picker" role="dialog" aria-modal="true" aria-labelledby="pk-t">
  <div class="ph">
    <div class="ph-row"><div class="grow"><h2 id="pk-t">{Elegí el plano | Plano del registro}</h2><p class="meta">{subtítulo}</p></div>
      <button class="icon-btn" data-act="closemodal" aria-label="Cerrar">ic('x','ic-24')</button></div>
    [desde el registro y con plano: <div class="seg" role="tablist"><button role="tab" aria-selected data-act="pkmode" data-mode="replace">Reemplazar</button><button role="tab" data-act="pkmode" data-mode="add">Agregar otro plano</button></div>]
    <label class="search-box">ic('search')<input class="search" type="search" data-input="docq" aria-label="Buscar plano del FOD 02" placeholder="Código, detalle o piso" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="search"></label>
    <select class="in" data-input="doccat" aria-label="Rubro"><option value="">Todos los rubros ({n})</option>…<option value="{cat}">{cat} ({n})</option></select>
  </div>
  <div class="pb" id="docList"></div>
  <div class="pf"><button class="btn lg block" data-act="closemodal">Cancelar</button></div>
 </div>
</div>
```

```css
.picker{box-sizing:border-box;width:100%;max-width:760px;height:88vh;height:88dvh;display:flex;flex-direction:column;background:var(--surface);border-radius:var(--r-lg) var(--r-lg) 0 0}
.picker .ph{padding:12px 16px 8px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}
.ph-row{display:flex;align-items:flex-start;gap:8px}
.ph-row .grow{flex:1;min-width:0}
.picker h2{margin:0;font-size:20px;font-weight:700}
.picker .pb{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.picker .pf{padding:8px 16px max(8px,env(safe-area-inset-bottom));border-top:1px solid var(--line)}
.doc{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:transparent;padding:12px 16px;min-height:56px;color:var(--ink)}
.doc:first-child{border-top:0}
.doc:active{background:var(--surface-2)}
.doc-l1{display:flex;align-items:flex-start;gap:8px}
.doc .code{flex:1;min-width:0;font:700 15px/1.35 var(--mono);overflow-wrap:anywhere}
.doc-l2{display:block;font-size:14px;margin-top:2px}
.seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--na-bg)}
.seg button{flex:1;min-height:48px;border:0;border-radius:var(--r-md);background:transparent;color:var(--ink);font-weight:600}
.seg button[aria-selected=true],.seg button[aria-pressed=true]{background:var(--primary);color:var(--on-primary)}
```

**Subtítulos.**
- Desde Nuevo registro: título «Elegí el plano», subtítulo «Última revisión de cada uno (FOD 02)».
- Desde el registro: título «Plano del registro», subtítulo «Se aplica a pendientes y N/A. AP y RZ quedan con su plano.»
- El segmentado reemplaza al botón «＋ Otro plano»: `replace` equivale a `target=default` y `add` a `target=defaultAdd`.

**Filas.**
- Si hay texto escrito, primera fila:
  ```html
  <button class="doc" data-act="pickfree"><span class="doc-l1">ic('pencil')<span class="code">Usar «{q}»</span></span><span class="meta">No está en el FOD 02: se usa tal cual</span></button>
  ```
- Cada documento:
  ```html
  <button class="doc" data-act="pickdoc" data-i><span class="doc-l1"><span class="code">{código}</span><span class="tag">{revLabel}</span></span>[<span class="doc-l2">{detalle}</span>]<span class="meta">{[piso, categoría, fmtDate(fecha)].join(' · ')}</span>[<span class="chips">{estado FOD (ap/rz)}{No vigente (rz)}</span>]</button>
  ```

**Comportamiento.**
- Al abrir: `inert` en `#top` y `#view`, `body.modal-open`, se guarda el foco. Escape cierra. Al cerrar, el foco vuelve al botón que lo abrió.
- Foco automático en el buscador **sólo** si `!matchMedia('(pointer: coarse)').matches`.
- Con teclado: el handler de `vv.resize` hace `panel.style.maxHeight = (vv.height - 12) + 'px'` mientras el modal está abierto.
- El rubro se filtra en el evento `change` del select `doccat`.
- Sin `pushState`.

#### 4.14 Listas, tarjetas, notas y estados vacíos

```css
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-1)}
.pad{padding:12px var(--gutter)}
.list{display:flex;flex-direction:column;gap:8px}
.row{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;box-sizing:border-box;padding:12px 14px;text-align:left;color:var(--ink);
  background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--sh-1)}
.row .grow{flex:1;min-width:0}
.row .ttl2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:16px;font-weight:700;line-height:1.3}
.row .chev{color:var(--muted)}
.row.alert{background:var(--rz-bg);border-left:4px solid var(--rz)}
.row.alert .ttl2{color:var(--rz)}
h2.sec{margin:24px 4px 8px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.note{display:flex;gap:10px;align-items:flex-start;border-radius:var(--r-md);padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.4;color:var(--ink);border-left:4px solid}
.note b{display:block;font-size:16px}
.note.info{background:var(--sync-bg);border-left-color:var(--sync)}
.note.warn{background:var(--pend-bg);border-left-color:var(--accent-edge)}
.note.err{background:var(--rz-bg);border-left-color:var(--rz)}
.note .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.empty{text-align:center;padding:32px 16px;color:var(--muted)}
.empty .ico{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2)}
.empty p{margin:0 0 12px;font-size:16px}
```

La clase `.row` se conserva: la E2E la usa.

---

### 5. Pantallas

#### 5.1 Sin datos y primera descarga

- **Header:** «PIE · Carga» / «Plan de Inspección y Ensayo», con engranaje.
- **Descargando:**
  ```html
  <div class="empty"><div class="ico">ic('sync')</div><p>Descargando el PIE… puede tardar hasta un minuto.</p></div>
  ```
  El ícono gira.
- **Sin datos:** `.empty` con:
  - `ic('download')`;
  - el texto «Todavía no hay datos en este celular. Hace falta señal una sola vez; después funciona sin conexión.»;
  - `.note.err` con el error traducido (§7.8), si hay;
  - `<button class="btn primary lg" data-act="sync" data-full="1">Descargar el PIE</button>`;
  - en modo pwa, `<button class="btn" data-act="go" data-to="/ajustes">Configurar conexión</button>`.

#### 5.2 ¿Quién sos?

- **Header:** «¿Quién sos?», sin subtítulo y sin engranaje.
- **Arriba:** `<p class="help">Elegí quién sos: tus iniciales se cargan solas en RESP.</p>`.
- **Lista** `.list` de `.row` (64 px):
  - `.avatar` con las iniciales;
  - nombre en 16/700 **tal como está en DATOS** (la E2E hace click en `text=FEDERICO CALZON`);
  - `.chip.ap` «vos» en el actual.
- **Al elegir:** toast ok `'Vas a firmar como ' + abrev + ' (' + nombre + ')'` y vuelve atrás.
- **Vacío:** «No hay responsables cargados en la hoja DATOS del PIE.»

#### 5.3 Inicio

- **Header:** `d.obra` / «PIE · FOP 01», indicador de red y engranaje.

Orden de arriba hacia abajo:

1. **Buscador.**
   - Se dibuja **una sola vez**:
     ```html
     <label class="search-box">ic('search')<input class="search" type="search" data-input="search" aria-label="Buscar planilla" placeholder="Buscar planilla (ej. hormigón, 28)" enterkeyhint="search"></label>
     ```
   - Debajo va `<div id="homeList">`. El `input` sólo reemplaza `#homeList` (§6.10).
2. **Nota de instalación** (§6.9), si corresponde.
3. **Sin inspector elegido:** `.note.info` con el texto «Elegí quién sos: tus iniciales se cargan solas en RESP.» y `<button class="btn sm" data-act="go" data-to="/quien">Elegir</button>`.
4. **P2: «Seguir»:**
   - `h2.sec` «Seguir» y hasta 5 filas `.row.recent`.
   - Cada fila lleva:
     - elemento en 16/700, 1 línea;
     - `.meta` `[piso, 'Planilla ' + sheet, ago(ts)].join(' · ')`;
     - chips: `.pend` «faltan N», `.rz` «N RZ» o `.ap` «Completo»;
     - `.bar`.
   - **Nunca** se muestra el título de la planilla en estas filas, para que la E2E no tenga dos coincidencias con `.row:has-text("HORMIGON ARMADO")`.
   - Origen: `LS 'recent' = [{s, k, t}]` con hasta 8 entradas. Se actualiza en `renderReg`, se migra de `p` a `h` (§6.7) y se descartan las entradas que no resuelven.
5. **Estado de las FUM** (V15/FLOW-17), en `<div id="homeList">`, antes de las planillas. Siempre lleva a `/fum` (`data-act="go" data-to="/fum"`).
   - Sin abiertas: `.row` de 56 px con `ic('check-circle','t-ap')`, «Sin FUM abiertas» en 16/600 y `ic('chev-r','chev')`.
   - Con abiertas: `.row.alert` con `ic('alert')`, título 16/700 y debajo una `.meta` (§7.3).
6. **Planillas por rubro.** `h2.sec` con el rubro. Cada `catRow` es un `.row` con:
   - `.tag.solid` con el número de planilla, **sin cero adelante**;
   - `.ttl2` con el título tal cual, hasta 2 líneas;
   - `.meta` `n + (n === 1 ? ' registro' : ' registros')`;
   - `.chips`, sólo de estado (§7.3);
   - `ic('chev-r','chev')`.
7. **Ocultas:** `<details class="hid"><summary class="row">…</summary>` con «Planillas ocultas · n» e `i-chev-d`, que rota.
8. **Pie:** `<p class="help center">` (§7.3).

#### 5.4 Planilla (categoría)

- **Header:** `cat.titulo` / `'Planilla ' + sheet + (rubro ? ' · ' + rubro : '')`. Sin engranaje.
- **Pestañas:** `.seg` con `role="tablist"`. Botones con `role="tab"`, `aria-selected` y `data-tab="reg|req"` (se conserva), de 48 px.
- **Registros:**
  - Si hay más de 5, el buscador (`aria-label="Buscar registro"`, placeholder «Buscar elemento, piso o sector») va dibujado una vez, con la lista en `<div id="regListBox">`.
  - Si corresponde, nota de planilla oculta (§7.4).
  - Orden: igual que hoy.
  - Cada fila `.row`:
    - `.ttl2` con el elemento;
    - `.meta` `[piso ? 'Piso ' + piso : '', sector, etapa ? 'Etapa ' + etapa : '', h ? 'fila ' + h : ''].filter(Boolean).join(' · ')`;
    - `.chips` (§7.4);
    - `.bar-row` con `<span class="n">{hechos}/{total}</span>`.
  - Se eliminan los chips «14 AP» y «22 N/A».
- **Requisitos:**
  - `.help` de introducción.
  - Cada etapa con `.stage-h` sin botón, no sticky (`position:static`).
  - Tarjetas `.task` con `.task-h`.
  - `.req-crit{padding:10px 16px;border-top:1px solid var(--line)}` con el criterio en 16 y `.meta`.
- **Barra:** «Nuevo registro», salvo que la planilla no tenga registros. En ese caso, el vacío de §7.4 y sin barra.

#### 5.5 Nuevo registro

- **Header:** «Nuevo registro» / `'Planilla ' + sheet + ' · ' + titulo`.
- **Formulario** `<form id="newForm" class="card pad">`:
  1. «Elemento a verificar (obligatorio)»: `input[name=elemento]`, placeholder «Ej.: Losa sobre 3° piso, V12-V14».
  2. `.grid3` con «Piso» (`name=piso`, placeholder «Ej.: 5P»), «Sector» (`name=sector`) y «Etapa» (`name=etapa`).
  3. «Plano (FOD 02)»:
     - `.pick` con `input[name=documento]` (placeholder «Código del plano») y `<button type="button" class="btn" data-act="docpick" data-target="new" aria-label="Elegir plano del FOD 02">FOD 02</button>`.
     - Debajo, actualizado en vivo (con el `input` y al elegir en el modal), uno de estos chips:
       - `.chip.ap` «R07 · vigente»;
       - `.chip.rz` «R06 · superado: rige R07»;
       - neutro «No está en el FOD 02».
     - Se calcula con `docRefs` y `revCmp` sobre el valor.
  4. `<fieldset><legend>Responsables</legend>` con «Responsable 1..n». Primera opción «Sin responsable» con `value=""`.
  5. «Controles a copiar» (`name=modelo`).
  6. `.help` de ayuda (§7.4).
- **CSS de `.pick`:** `{display:flex;gap:8px} .pick .in{flex:1;min-width:0} .pick .btn{flex:none}`.
- **Barra:** «Crear registro». Se oculta sólo con el teclado (`body.kb`).

#### 5.6 Registro: pantalla de trabajo (P0)

```
[‹] Losa L5                              [☁↑ Sin enviar · 2]   header 56 + safe-area
    5P · Planilla 6 · 3/46 · 1 RZ
┌ .card.sum ─────────────────────────────────────────┐
│ (Elemento completo en 20/700, sólo si se cortó    │  .sum-el [hidden]
│  en el header)                                     │
│ 5P · Núcleo A · Etapa 1 · FC, MP              [✎] │  #hdr  .sum-meta 14 muted + lápiz 48
│ Planilla 6 · fila 812 · cambios sin enviar        │        .sum-foot 14
│ ────────────────────────────────────────────────  │
│ [▤] KIR-COMR-REF-ESTR-S12P-R07 (vigente)        › │  .docrow ≥48
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  .bar 8 px
└────────────────────────────────────────────────────┘
[ Plano superado … (sólo si aplica) ]
[ 46 Todos | 43 Pend. | 1 AP | 1 RZ | 1 N/A ]           .filters 56
⌄ PRE  3/33 ▬▬ ═══════════════════════════════════   banda sticky 48
┌ Replanteo Preliminar               Muestra 100% ┐
│▌Criterio…                                        │
│▌ID · NIVEL OPTICO (INDIQUE NO. SERIAL)           │
│▌[✓ AP] [✕ RZ] [– N/A]  [⌄]                       │  56 px
│▌AP · 20/10/26 · FC                               │
│▌[Falta N° de serie]                              │
[ ✓✓ Aprobar los 30 pendientes de PRE ]              al final de la etapa
═══ barra: [ ↓ Siguiente pendiente           43 ] ══
```

- **Header:**
  - Título: `reg.elemento || 'Registro'`.
  - Subtítulo: `[reg.piso, 'Planilla ' + sheet, (s.total - s.pend) + '/' + s.total, s.rz ? s.rz + ' RZ' : ''].filter(Boolean).join(' · ')`.
  - Sin engranaje.
- **Resumen** (`<section class="card sum">`, padding `12px var(--gutter)`):

  ```html
  <section class="card sum">
    <div id="hdr">
      <h1 class="sum-el" hidden>{elemento}</h1>
      <div class="sum-row">
        <div class="grow">
          [<p class="sum-meta">{[piso, sector, etapa ? 'Etapa ' + etapa : '', resp.filter(x => x && x !== 'N/A').map(abrevOf).join(', ')].filter(Boolean).join(' · ')}</p>]
          <p class="sum-foot">{reg.pending ? 'Planilla ' + sheet + ' · nuevo, se crea en el PIE al enviarse' : 'Planilla ' + sheet + ' · fila ' + h}{dirty && !pending ? ' · <span class="t-sync">cambios sin enviar</span>' : ''}</p>
        </div>
        [MODE === 'sidebar' && !pending: <button class="icon-btn" data-act="goto" data-sheet data-row aria-label="Ver fila en la planilla">ic('ext')</button>]
        <button class="icon-btn" data-act="hdr" data-key aria-label="Editar datos del registro">ic('pencil')</button>
      </div>
    </div>
    <button class="docrow" data-act="docpick" data-target="default" data-key data-regdoc="1" data-value="{rdoc}" aria-label="Plano del registro: {rdoc || 'sin plano'}. Cambiar">
      ic('doc')<span class="docrow-codes">{por cada parte de rdoc.split('//'): <span class="dr"><span class="code">{parte}</span> {chip}</span>}</span>ic('chev-r','chev')
    </button>
    <div class="bar">…</div>
  </section>
  ```

  ```css
  .sum h1.sum-el{margin:0 0 6px;font-size:20px;line-height:1.25;font-weight:700;overflow-wrap:anywhere}
  .sum-row{display:flex;align-items:flex-start;gap:4px}
  .sum-meta,.sum-foot{margin:0;font-size:14px;line-height:1.4;color:var(--muted)}
  .sum-meta{color:var(--ink);font-weight:600}
  .sum-row .icon-btn{margin:-8px -8px 0 0}
  .docrow{display:flex;align-items:center;gap:8px;width:100%;min-height:48px;margin:10px 0 0;padding:8px 0 0;border:0;border-top:1px solid var(--line);background:none;color:var(--ink);text-align:left}
  .docrow-codes{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
  .docrow .code{font:600 14px/1.35 var(--mono);overflow-wrap:anywhere}
  .sum .bar{margin-top:10px}
  ```

  - **`.sum-el`:** después del render, si `ttl.querySelector('b').scrollWidth > clientWidth`, se le saca `hidden`.
  - **«cambios sin enviar»:** el texto literal queda **dentro de `#hdr`** (lo leen las líneas 99 y 133 de la E2E).
  - **Chip de cada parte del plano,** con `docRefs(parte)[0]`:
    - si no hay referencia: neutro «fuera del FOD 02»;
    - si `isNo(r.doc[7])`: `.rz` «no vigente»;
    - si `r.used == null`: neutro «sin rev.»;
    - si `revCmp(r.used, r.doc[1]) < 0`: `.rz` «superado»;
    - en otro caso: `.ap` «vigente».
  - **Sin plano:** `.code` muestra «Falta plano · elegí el del FOD 02» en `--pend`, sin chip.
  - **Se eliminan** el `<input data-regdoc>`, el párrafo de ayuda y el botón «＋ Otro plano». La ayuda y el modo «Agregar» pasan al selector, y el texto libre se carga con «Usar «…»».
  - **Edición:** el lápiz alterna `S.ui.open['hdr:' + key]`. Con la edición abierta, `#hdr` contiene `headerForm` (`id="hdrForm"`): rótulos en tipo oración, opción vacía «Sin responsable» y botones «Cancelar» y «Guardar» de 48 px. `.docrow` y `.bar` siguen visibles.
- **Banner de plano superado:** `.note.err` con `ic('alert')`, textos de §7.5 y `<button class="btn sm primary" data-act="docupdall" data-key>Pasar a R{l}</button>`.
- **Error de envío:** `.note.err` con «No se pudo enviar al PIE: {msg}» y los botones «Reintentar» (`data-act=retry`) y «Ver envíos» (`data-act=go data-to=/ajustes`).
- **Nota de almacenamiento:** si falla guardar en el celular (§6.9), `.note.err` fija.
- **Lista:** filtros (§4.8), etapas (§4.9) y controles (§4.6).
- **Barra:** §4.10.
- **`S.ui.focus` (gofum):** abre el detalle, aplica `scrollIntoView({block:'center', behavior})` y `.hl`.

#### 5.7 FUM

- **Header:** «FUM» / `n === 0 ? 'Ninguna abierta' : n === 1 ? '1 abierta' : n + ' abiertas'`. Con engranaje: la E2E entra a Ajustes desde acá.
- **`fogAviso`:** `.note.warn`, como hoy.
- **Abiertas:** `h2.sec` «Abiertas · n» (texto exacto de la E2E).
  - Orden:
    1. vencidas (`plazo < hoy`), por plazo ascendente;
    2. con plazo, ascendente;
    3. sin fecha, por apertura;
    4. al final, las no enviadas.
  - Cada fila `.row.fumrow` (`data-act="gofum"` con `data-sheet`, `data-key` y `data-off`):
    - `.tag.fum` «FUM 4», o `.tag.fum.new` «Nueva»;
    - `.ttl2` con el elemento;
    - el criterio en 14 `--ink`, hasta 2 líneas;
    - `.meta` `[piso ? 'Piso ' + piso : '', 'Planilla ' + sheet, 'abierta ' + ago(apertura)]`. `piso` sale de `f.piso`, o en las altas locales de `getReg(sheet, key).piso`;
    - `.chips`: `.rz` «Vencida · dd/mm/aa», `.pend` «Reinspección dd/mm/aa» o `.pend` «Sin fecha de reinspección», y `.sync` «Sin enviar»;
    - `.meta` `'Acción: ' + acción`;
    - `ic('chev-r','chev')`.
- **Cerradas:** `<details class="hid">` con `summary` «Cerradas / anuladas · n» (texto exacto).
- **`gofum`:** fija `S.ui.filter[key] = 'all'` antes de navegar.
- **Pie:** `.help` (§7.6).

#### 5.8 Ajustes

- **Header:** «Ajustes», sin subtítulo y sin engranaje.
- **Secciones** (`h2.sec`), en este orden:

1. **`<h2 class="sec" id="envios">Envíos pendientes · {S.queue.length}</h2>`** (texto exacto de la E2E).
   - Si hay señal y pendientes, arriba: `<button class="btn primary block" data-act="sync" data-manual="1">Enviar ahora</button>`.
   - Una `.card .op` por operación:
     - título (§7.7) como `<button class="btn ghost" data-act="go" data-to="/c/{sheet}/r/{key}">`. `key` es `'h' + op.h` o `'p' + (op.ref || op.id)`; si el registro ya no existe, el título no es botón;
     - `.meta` `'Planilla ' + sheet + ' · ' + ago(createdAt)`;
     - nota de error;
     - `[Reintentar]` (`.btn.sm`) y, separado 16 px, `<button class="btn sm ghost danger" data-act="discard">Descartar</button>`, que confirma con `ask` (§7.7).
   - Vacío: «Todo enviado. No hay nada pendiente.»
2. **Usuario:** fila con `.avatar`, nombre y `.meta` `'Tus iniciales (' + abrev + ') van en RESP. al marcar'`, más el botón «Cambiar» (`/quien`).
3. **Datos:**
   - `.meta` con `'Última actualización: ' + ago(S.lastSync)`;
   - nota con el error traducido;
   - `.meta` `'Espacio usado en el celular: ' + mb + ' MB'` (con `navigator.storage.estimate()`, si existe);
   - nota fija de almacenamiento, si `S.storageError`;
   - `<button class="btn primary block" data-act="sync" data-full="1" data-manual="1">Enviar y actualizar ahora</button>`.
4. **Conexión** (sólo en modo pwa; en web o panel, sólo la clave), con `id="conexion"`:
   - «Enlace de la app (termina en /exec)»;
   - «Clave de acceso»;
   - `<button class="btn primary block">Guardar y probar</button>`.
   - La validación queda como `.field-err` **persistente debajo del campo**, no como toast.
5. **Apariencia:** `.seg` con `data-act="theme"` y `data-theme="auto|light|dark"`, `aria-pressed`, y debajo `.help` «Automático sigue el modo del iPhone.»
6. **Instalar** (pwa) o **Modo sin conexión** (web o panel): textos de §7.7.
7. **P2: «Avisos del PIE»:** últimos 20 de `LS 'avisos'`, con «Borrar avisos».
8. **Pie:** versión y modo y, si `S.updateReady`, `<button class="btn" data-act="reload">Recargar app</button>`.

---

### 6. Comportamiento

#### 6.1 Marcar un control (P0)

**Estado nuevo en memoria:** `S.ui.lastMark = {}`, `S.ui.keep = {}`, `S.hold = {}`, `S.scroll = {}`.

**Manejador `mark`:**

```js
if (!S.settings.inspector) { toast('Primero elegí quién sos', {kind:'info'}); return nav('/quien'); }
var lk = reg.key + ':' + off, now = Date.now();
if (S.ui.lastMark[lk] && now - S.ui.lastMark[lk] < 700) return;          // rebote o doble toque: se ignora sin aviso
S.ui.lastMark[lk] = now;
var it = itemOf(reg, off);
if (itemState(it) === st) { toast('Ya está en ' + EST[st] + '. Para borrarlo: Detalle › Borrar carga.', {kind:'info'}); return; }
decideMark(reg, it, st).then(function (plan) {
  if (!plan) return;
  applyMark(reg, it, st, plan);
  var f = S.ui.filter[reg.key] || 'all';
  if (f !== 'all') (S.ui.keep[reg.key] = S.ui.keep[reg.key] || {})[off] = true;
  render({ keepScroll: true });
  var b = document.querySelector('#it-' + off + ' [data-st=' + st + ']'); if (b) b.focus({ preventScroll: true });
});
```

- `EST = {ap:'AP', rz:'RZ', na:'N/A'}`.
- **El bloqueo es por control, no global:** la E2E marca controles distintos seguidos.
- **Desaparece** la rama `cur === st` de `markItem` (desmarcar con un segundo toque). Para quitar un estado se usa siempre «Borrar carga».
- **`keep`:** `renderReg` filtra con `filter === 'all' || itemState(it) === filter || (S.ui.keep[reg.key] || {})[it.off]`. Los ítems retenidos llevan `.kept`. `keep[reg.key]` se vacía al cambiar de filtro, al tocar «Siguiente pendiente» y al salir del registro.
- **Filtro inicial:** en `renderReg`, si `S.ui.filter[reg.key] == null`, vale `(s.pend > 0 && s.total - s.pend > 0) ? 'pend' : 'all'`. Se calcula una sola vez por registro y sesión. Una elección explícita se respeta, y `gofum` fuerza `'all'`.
- `updateStageChips` y el `refreshItem` previo al render se eliminan del camino de marcar. P2: `patchSummary` (eng-01).

#### 6.2 `decideMark` / `applyMark` (P0)

`decideMark(reg, it, st, opts)` devuelve `Promise<plan|null>`. Las preguntas sólo se hacen si no es `opts.silent`.

1. **`st === 'rz'`:** `plan.openFum = !f.open && !it.fum`. El detalle se abre en `applyMark`.
2. **`st` es `ap` o `na` y `f.open`:**
   - **FUM nueva retenida** (`f.pend && f.pend.status === 'pending' && isHeld(f.pend)`): es la corrección de un RZ por error. `plan.dropFum = f.pend`, sin preguntar. Después de aplicar, toast info «FUM descartada: no se había enviado.»
   - **En cualquier otro caso** (numerada, o nueva pero liberada o ya enviada): es una reinspección real.
     - AP: `ask` «reinspección» (§7.9). Si responde `ok`: `plan.closeFum = {resultado: 'Reinspección AP'}`.
     - N/A: `ask` «no aplica». Si responde `ok`: `plan.closeFum = {resultado: 'Anulada'}`.
     - Si responde `null`: la promesa devuelve `null`.
   - **Cambio deliberado respecto de la v1.5:** una FUM sin enviar ya no se descarta en silencio si el RZ era real. El cierre usa `ref: f.pend.id`; el backend lo resuelve dentro del mismo lote, porque el log se escribe por operación.
3. **`st` es `ap` o `rz`:** decisión del plano (§6.6) → `plan.doc` o `plan.upgrade`.
4. **`applyMark`:**
   - aplica `dropFum` con `dropOp`;
   - aplica `closeFum` con `queueFum({accion:'cerrar', num|ref, resultado, fecha:today()})` y `hold(op, 6000)`;
   - arma el `patch` como hoy (N/A: `fecha:'NA'`; AP o RZ: fecha de hoy, `resp` y la memoria del instrumento);
   - llama a `editItem`;
   - con `closeFum`, muestra el toast con Deshacer (§6.4): «FUM N° 4 se cierra al enviar» / «FUM N° 4 se anula al enviar».
   - con `openFum`: `queueFum({accion:'abrir', obs, accionInmediata:'Reparar'})`, `S.hold[op.id] = {since:now, until:0, det:key + ':' + off, key}` y `S.ui.open[key + ':' + off] = true`.

#### 6.3 Retención de envíos de la FUM (P0)

```js
function isHeld(o) {
  var h = S.hold[o.id]; if (!h) return false;
  if (Date.now() < h.until) return true;
  if (h.det && S.ui.open[h.det] && routeIsReg(h.key) && Date.now() - h.since < 600000) return true;
  delete S.hold[o.id]; return false;
}
function hold(op, ms) { S.hold[op.id] = { since: Date.now(), until: Date.now() + ms, det: null };
  setTimeout(function () { if (navigator.onLine || IN_GAS) { clearTimeout(autoSyncT); autoSyncT = setTimeout(sync, 300); } }, ms + 100); }
```

- **En `sync()`:** `sending = S.queue.filter(o => o.status === 'pending' && o.op !== 'photo' && !isHeld(o))`.
- **Al cerrar un detalle o cambiar de ruta:** si había retenciones con ese `det`, se llama a `queueChanged()`.
- **Conteo:** las operaciones retenidas cuentan en `n`. El indicador muestra «Sin enviar · 1», nunca «Al día».
- **Persistencia:** la retención no se persiste. Si iOS cierra la app, la operación (que sí está en la cola) sale en el próximo arranque.
- **Efecto extra:** lo que se carga en la FUM mientras está retenida entra en la misma operación `abrir` (rama `f.pend.status === 'pending'` de `editFum`).

#### 6.4 Borrar carga y Deshacer (P0)

**«Borrar carga» (`data-act="clear"`):**

1. `ask` «borrar» (§7.9), con texto según haya FUM nueva, FUM numerada o ninguna.
2. Se guarda `prev = {estado, fecha, resp, fum, obs, documento, instrumento}`.
3. Si `f.open`:
   - Si `f.pend` está `pending` y no fue enviada: se guarda en `restore` y se aplica `dropOp`. También se descartan las operaciones con `ref === f.pend.id`.
   - Si no: `anul = queueFum({accion:'cerrar', num|ref, resultado:'Anulada', fecha:today()})` y `hold(anul, 6000)`.
4. `editItem(reg, off, {estado:'', fecha:'', resp:'', fum:'', obs:''})`. El detalle queda abierto y las fotos no se tocan.
5. Toast ok «Carga borrada» con Deshacer.

**Deshacer (6 s), genérico:** `S.undo = {patches:[{sheet, key, off, prev}], drop:[ops creadas], restore:[ops descartadas]}`. Al tocar:

- `drop`: si la operación sigue `pending`, `dropOp`. Si ya salió (no debería, por la retención de 6 s), toast err «No se puede deshacer: la FUM ya se cerró en el FOG 01.»
- `restore`: `S.queue.push(o)` con `o.status = 'pending'`.
- `patches`: `editItem(getReg(sheet, key), off, prev)` por cada uno. Genera un cambio normal y funciona aunque el original ya se haya enviado.
- `queueChanged()`, `render({keepScroll:true})` y toast info «Listo, se deshizo».

**Se ofrece Deshacer en:** Borrar carga, AP o N/A que cierran o anulan una FUM, Aprobar pendientes y N/A a la tarea. **No** en una marca suelta sobre un control pendiente: corregir es tocar otro estado.

#### 6.5 Aprobar pendientes y N/A a la tarea

**«Aprobar pendientes» (`bulk`):**
1. Si el registro tiene el plano superado y no hay `docKeep`, primero `ask` del plano (§6.6), una sola vez.
2. Después `ask` «aprobar» (§7.9).
3. Guarda `prev` de cada control y aplica `applyMark(..., 'ap', plan)` en modo silencioso.
4. `render({keepScroll:true})` y toast ok `n === 1 ? '1 control aprobado' : n + ' controles aprobados'` con Deshacer.

**P2 «N/A a la tarea» (`taskna`):** igual, con `ask` «tarea N/A», `st = 'na'` (sin pregunta de plano) y toast `n + ' controles en N/A'` con Deshacer. Marca sólo los pendientes de esa tarea.

#### 6.6 Plano superado: una pregunta por registro y revisión (P0)

En `decideMark` (AP o RZ, sin `silent`):

```js
var doc = docDefault(reg) || it.documento;
var ds = doc && docStatus({documento: doc, estado: '', fecha: ''});
var kk = 'docKeep.' + reg.sheet + '.' + reg.key, kv = ds && ds.code + '|' + ds.latest;
```

- Si `ds.level === 'old'` y `LS.get(kk) !== kv`: `ask` «plano» (§7.9).
  - `'ok'` → `plan.upgrade = true`. `applyMark` hace `doc = docUpgrade(doc); setRegDoc(reg, doc)`, y después del render muestra el toast «Registro pasado a R07 · n controles actualizados».
  - `'alt'` → `LS.set(kk, kv)` y `plan.doc = doc`.
  - `null` → no marca.
- Si `LS.get(kk) === kv`: marca con el plano viejo sin preguntar.
- El banner rojo queda como recordatorio permanente. Si aparece una revisión aún más nueva, cambia `kv` y se vuelve a preguntar.
- **Nunca** hay `confirm()` en el camino de marcar.

#### 6.7 Alta confirmada: sin salto y sin pérdida (P0, Bloque 0)

**Alias en `getReg(sheet, key)`.** Si `key` es `'p' + id`, no hay `pendingCreate(id)` y existe `S.resolved[id]`, se devuelve `getReg(sheet, 'h' + S.resolved[id].h)`. Así el `change` de un campo con el `data-key` viejo se guarda igual.

**`migrateKey(sheet, pk, hk)`** (idempotente) renombra:
- en `S.ui.open`: `pk + ':*'` y `'hdr:' + pk`;
- `S.ui.filter[pk]`;
- en `S.ui.folded`: `pk + '|*'`;
- `S.ui.keep[pk]`;
- en `S.ui.lastMark`: `pk + ':*'`;
- el campo `det` de `S.hold`;
- `S.scroll` y `S.stack` (rutas `/r/pk`);
- en LS: `doc.{sheet}.{pk}`, `docKeep.{sheet}.{pk}` y las entradas de `recent`. Sólo si todavía no existe la versión con `hk`.

**En el `.then` final de `sync()`**, que reemplaza las líneas 1092-1099:

```js
S.syncing = false;
Object.keys(S.resolved).forEach(function (id) { var r = S.resolved[id]; if (!pendingCreate(id)) migrateKey(r.sheet, 'p' + id, 'h' + r.h); });
var m = /^\/c\/([^/]+)\/r\/p(.+)$/.exec(S.route);
if (m && S.resolved[m[2]] && !pendingCreate(m[2])) {
  S.route = '/c/' + m[1] + '/r/h' + S.resolved[m[2]].h;
  if (!IN_GAS) try { history.replaceState(null, '', '#' + S.route); } catch (e) {}
}
if (isEditing()) { renderTop(); S.ui.renderOnBlur = true; }   // nunca nav(), nunca scrollTo(0,0)
else finishRender();                                            // §6.8
```

**Render pendiente.** `focusout` global → `setTimeout(50)`: si `S.ui.renderOnBlur && !isEditing()`, pone `renderOnBlur = false` y hace `render({keepScroll:true})`.

#### 6.8 Desplazamiento y navegación (P0 el anclaje en el alta; P1 el resto)

- **`render({keepScroll})` anclado a un control:**
  ```js
  var lim = document.getElementById('top').getBoundingClientRect().bottom + 48, anchor = null;
  [].some.call(view.querySelectorAll('.item'), function (el) { var r = el.getBoundingClientRect(); if (r.bottom > lim) { anchor = { id: el.id, top: r.top }; return true; } });
  … render …
  var n = anchor && document.getElementById(anchor.id);
  if (n) window.scrollBy(0, n.getBoundingClientRect().top - anchor.top); else window.scrollTo(0, y);
  ```
- **Renders de fondo durante un scroll:** `var lastScroll = 0; addEventListener('scroll', function(){ lastScroll = Date.now(); }, {passive:true});`. `finishRender()` se reintenta cada 400 ms mientras `Date.now() - lastScroll < 400`.
- **Buscador enfocado al terminar un envío:** si el elemento activo es un buscador, sólo se actualizan su lista y `renderTop()` (§6.10).
- **Navegación:**
  - `nav(route)` guarda `S.scroll[S.route] = scrollY` y, al ir hacia adelante, hace `scrollTo(0,0)`.
  - `back()` y `popstate` hacen `render()` y después `window.scrollTo(0, S.scroll[S.route] || 0)`.
  - Al salir de un registro: se vacía su `keep` y se libera la retención (`queueChanged()`).
- **«Siguiente pendiente»:**
  ```js
  S.ui.keep[reg.key] = {}; render({ keepScroll: true });
  var lim = document.getElementById('top').getBoundingClientRect().bottom + 48 + 8;
  var all = [].slice.call(document.querySelectorAll('.item.pend'));
  var nx = all.filter(function (x) { return x.getBoundingClientRect().top > lim + 10; })[0] || all[0];
  // si no hay: desplegar todo, render y buscar de nuevo (como hoy)
  window.scrollTo({ top: scrollY + nx.getBoundingClientRect().top - lim, behavior: RM.matches ? 'auto' : 'smooth' });
  nx.classList.add('hl'); setTimeout(function () { nx.classList.remove('hl'); }, 1500);
  ```
- **CSS:** `.item{scroll-margin-top:calc(var(--hdr-h) + 56px)}`, para el `scrollIntoView` de `gofum`.

#### 6.9 Ciclo de vida y almacenamiento (P0, Bloque 0)

**`KV` robusto (eng-02):**
1. En `db()`: `r.onsuccess = function () { var d = r.result; d.onclose = d.onversionchange = function () { dbp = null; }; res(d); }`.
2. Helper `tx(mode, fn)`: si `d.transaction()` lanza un error o la transacción aborta (`t.onabort = function(){ rej(t.error || new Error('abort')) }`), pone `dbp = null` y reintenta **una** vez.
3. **`KV.set(k, v)`:**
   - si IndexedDB funciona: borra `LS 'kvlocal.' + k`;
   - si falla: `LS.trySet('kv.' + k, v)` y `LS.trySet('kvlocal.' + k, Date.now())`;
   - si también falla localStorage, **rechaza** la promesa.
   - `LS.trySet` devuelve un booleano; `LS.del` es nuevo.
4. **`KV.get(k)`:** si existe `kvlocal.k`, devuelve el valor de localStorage (el más nuevo) e intenta reescribirlo en IndexedDB; si lo logra, borra la marca y `kv.k`. Si no hay marca, lee IndexedDB y, si falla, cae a localStorage como hoy. El formato de los valores no cambia.
5. **Si falla guardar `queue`:**
   - `S.storageError = true`;
   - toast err una sola vez: «No se pudo guardar en el celular. No cierres la app y liberá espacio.»;
   - `.note.err` fija en Registro y en Ajustes › Datos.
6. **`addPhotos`:** la operación entra en la cola sólo si `KV.set(img)` resuelve. Si se rechaza: toast err «No se pudo guardar la foto en el celular: falta espacio. Liberá espacio y sacala de nuevo.» Separar este error del de compresión (§7.8).
7. **Al arrancar** (modo pwa): `navigator.storage && navigator.storage.persist && navigator.storage.persist()`.
8. **P1:** si `MODE === 'pwa'` y no se cumple ni `navigator.standalone` ni `matchMedia('(display-mode: standalone)').matches`, se muestra en Inicio un `.note.warn` con el texto de §7.3.

**Ciclo de vida (eng-08):**

```js
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { var a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur(); saveQueue(); }
  else onResume();
});
window.addEventListener('pageshow', function (e) { if (e.persisted) onResume(); });
function onResume() { renderTop(); if ((navigator.onLine || IN_GAS) && S.queue.some(function (o) { return o.status === 'pending'; })) sync(); if (swReg) swReg.update(); }
```

El `blur` dispara `change` y guarda el texto. Las retenciones (§6.3) **no** se liberan al ocultarse.

#### 6.10 Buscadores (P1, eng-16)

- `renderHome()` dibuja el `<input>` una vez y la lista con `homeListHtml(q)` dentro de `#homeList`. El evento `input` (con 150 ms de retardo) hace sólo `homeList.innerHTML = homeListHtml(q)`.
- En la planilla, lo mismo con `#regListBox`.
- `keydown` Enter sobre un buscador hace `blur()`.

#### 6.11 Service worker (P1, eng-14)

- **`sw.js`:**
  - `CACHE = 'pie-carga-v1.6.0'`.
  - El `.catch` devuelve `hit || new Response('<meta name=viewport content="width=device-width"><h1>Sin señal</h1><p>Abrí la app una vez con conexión.</p>', {headers:{'Content-Type':'text/html; charset=utf-8'}})`.
- **`index.html`:**
  ```js
  navigator.serviceWorker.register('sw.js').then(function (reg) {
    swReg = reg;
    reg.addEventListener('updatefound', function () {
      var w = reg.installing; if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'activated' && navigator.serviceWorker.controller) {
          S.updateReady = true;
          toast('Hay una versión nueva de la app', {kind:'info', action:{label:'Recargar', fn:function(){ location.reload(); }}});
        }
      });
    });
  });
  ```
- No se usa `sw.js?v=`.

#### 6.12 Política de avisos (FLOW-08)

- **Se eliminan** los toasts automáticos «Registro creado en la planilla», «Foto subida» / «fotos subidas», «FUM actualizada en la planilla» y «Sincronizado» (cuando el envío fue automático).
- **Se mantienen:**
  - las respuestas a una acción del usuario;
  - los errores;
  - los avisos del PIE (`warn`, con prioridad);
  - el número de FUM asignado: `'FUM N° ' + r.fum + ' abierta en el FOG 01'` (ok), sólo para `accion:'abrir'`.
- **P2:** los `r.warnings` se guardan además en `LS 'avisos'` (`{ts, sheet, h, text}`, los últimos 20).

#### 6.13 Accesibilidad (P1)

- Todos los SVG llevan `aria-hidden="true"` (lo pone `ic()`).
- **Estados:**
  - AP, RZ, N/A, filtros y Apariencia: `aria-pressed`.
  - `.more`: `aria-expanded` y `aria-controls`.
  - `.seg`: `role="tablist"` / `role="tab"` con `aria-selected`.
  - `.fold`: `aria-expanded` (se conserva).
- **Nombre de AP/RZ/N/A:** el texto visible, con `aria-describedby="crit-{off}"`. No se usa `aria-label="Aprobado"` (WCAG 2.5.3).
- **Foco:**
  - después de marcar, vuelve al botón (§6.1);
  - al abrir el detalle con el chip «Falta N° de serie», va a `select[data-field=instrumento]`;
  - en hojas y modal, ver §4.12 y §4.13.

---

### 7. Textos exactos

#### 7.1 Header

| Pantalla | Título | Subtítulo |
|---|---|---|
| Sin datos | `PIE · Carga` | `Plan de Inspección y Ensayo` |
| Inicio (l.1191) | `d.obra \|\| 'PIE · Carga'` | `PIE · FOP 01` |
| Planilla (l.1249) | `cat.titulo` | `'Planilla ' + sheet + (rubro ? ' · ' + rubro : '')` |
| Nuevo (l.1321) | `Nuevo registro` | `'Planilla ' + sheet + ' · ' + titulo` |
| Registro (l.1422) | `reg.elemento \|\| 'Registro'` | `[piso, 'Planilla ' + sheet, hechos + '/' + total, rz ? rz + ' RZ' : ''].filter(Boolean).join(' · ')` |
| FUM (l.843) | `FUM` | `Ninguna abierta` / `1 abierta` / `n + ' abiertas'` |
| ¿Quién sos? (l.1648) | `¿Quién sos?` | (vacío) |
| Ajustes (l.1657) | `Ajustes` | (vacío) |

#### 7.2 Indicador

- Textos: ver la tabla de §4.2.
- Toast al tocarlo sin señal:
  - con `n > 0`: `'Sin señal. Tus ' + n + (n === 1 ? ' cambio queda' : ' cambios quedan') + ' en el celular y se envían solos al volver la señal.'`;
  - con `n = 0`: `Sin señal. Lo que cargues queda en el celular.`

#### 7.3 Inicio

| Lugar | Texto |
|---|---|
| Placeholder del buscador | `Buscar planilla (ej. hormigón, 28)` · aria `Buscar planilla` |
| Sin resultados (l.1219) | `'No hay planillas con «' + S.ui.search.trim() + '». Probá con el número (28) o una palabra (hormigón).'` |
| Nota de inspector (l.1210) | `Elegí quién sos: tus iniciales se cargan solas en RESP.` · botón `Elegir` |
| Nota de instalación | `Instalá la app: en Safari, Compartir › Agregar a inicio. Así no se borra lo cargado sin señal.` |
| FUM, sin abiertas | `Sin FUM abiertas` |
| FUM, con abiertas | Título `n === 1 ? '1 FUM abierta' : n + ' FUM abiertas'`. Meta: `[venc ? venc + (venc === 1 ? ' vencida' : ' vencidas') : '', sinF ? sinF + ' sin fecha de reinspección' : ''].filter(Boolean).join(' · ') \|\| 'Ninguna vencida'` |
| Fila de planilla | meta `n + (n === 1 ? ' registro' : ' registros')` · chips `.pend` `n + ' con pendientes'` · `.rz` `n + (n === 1 ? ' FUM abierta' : ' FUM abiertas')` · `.rz` `ic(alert) + n + ' con plano superado'` · `.sync` `n + (n === 1 ? ' nuevo sin enviar' : ' nuevos sin enviar')` · neutro `Oculta` |
| Ocultas | `'Planillas ocultas · ' + n` |
| Pie (l.1220) | `s = ago(S.lastSync)`: `(s === 'nunca' ? 'Sin actualizar' : 'Actualizado ' + (/^(hace\|recién)/.test(s) ? s : 'el ' + s)) + ' · v' + APP_VERSION` |
| P2 «Seguir» | Sección `Seguir` · chips `'faltan ' + n` / `n + ' RZ'` / `Completo` |

#### 7.4 Planilla y Nuevo registro

| Lugar | Texto |
|---|---|
| Pestañas | `Registros` · `Requisitos` |
| Buscador de registros | placeholder `Buscar elemento, piso o sector` · aria `Buscar registro` |
| Sin coincidencias (l.1266) | `'Ningún registro coincide con «' + texto + '».'` (texto tal como se escribió) |
| Planilla oculta (l.1264) | `Esta planilla está oculta en el PIE. Se vuelve a mostrar al crear un registro.` |
| Sin registros o sin modelo (l.1266, 1301, 1322) | `Esta planilla todavía no tiene registros para usar de modelo. Cargá el primero en el PIE desde la computadora.` |
| Chips de registro | `'faltan ' + n` (pend) · `Completo` (ap) · `Sin iniciar` (neutro) · `n + ' RZ'` (rz) · `Nuevo · sin enviar` / `Cambios sin enviar` (sync) · `ic(alert) + 'Plano superado'` (rz) |
| Requisitos (l.1302) | `'Los ' + n + ' controles que se copian en cada registro nuevo. IV = inspección visual · ID = inspección dimensional.'` |
| Barra | `Nuevo registro` |
| Rótulos de Nuevo | `Elemento a verificar (obligatorio)` · `Piso` · `Sector` · `Etapa` · `Plano (FOD 02)` · `Responsables` (legend) · `'Responsable ' + i` · `Controles a copiar` |
| Placeholders | `Ej.: Losa sobre 3° piso, V12-V14` · `Ej.: 5P` · `Código del plano` |
| Chip del plano en vivo | `'R' + rev + ' · vigente'` / `'R' + used + ' · superado: rige R' + latest` / `No está en el FOD 02` |
| Opción vacía de responsable | `Sin responsable` (`value=""`) |
| Opción de modelo | `n + ' controles · como ' + (elemento \|\| 'sin elemento') + (i === 0 ? ' (último)' : '')` |
| Ayuda | `'Se agrega al final de la planilla ' + sheet + ' con todos los controles pendientes.'` |
| Barra | `Crear registro` |
| Toast al crear | con señal `Registro guardado · enviando…` · sin señal `Guardado en el celular · se envía al tener señal` |

#### 7.5 Registro, detalle y FUM

| Lugar | Texto |
|---|---|
| Pie del resumen | `'Planilla ' + sheet + ' · fila ' + h` + (dirty ? ` · cambios sin enviar` : '') · alta local `'Planilla ' + sheet + ' · nuevo, se crea en el PIE al enviarse'` |
| Chips del plano | `vigente` · `superado` · `no vigente` · `sin rev.` · `fuera del FOD 02` · sin plano `Falta plano · elegí el del FOD 02` |
| Banner (l.1450-1455) | título `Plano superado` · `'El registro usa R' + u + '; rige la R' + l + (fecha ? ' desde ' + fmtDate(fecha) : '') + '.'` · `n + (n > 1 ? ' pendientes usan' : ' pendiente usa') + ' una revisión vieja.'` · `n + (n > 1 ? ' controles marcados' : ' control marcado') + ' con una revisión ya reemplazada: ' + (n > 1 ? 'revisalos.' : 'revisalo.')` · botón `'Pasar a R' + l` |
| Error de envío (l.1459) | `'No se pudo enviar al PIE: ' + msg` · `Reintentar` · `Ver envíos` |
| Filtros | `Todos` · `Pend.` · `AP` · `RZ` · `N/A` |
| Etapa, al pie | `n === 1 ? 'Aprobar el pendiente de ' + st : 'Aprobar los ' + n + ' pendientes de ' + st` |
| P2 tarea | `N/A a la tarea` |
| Chip de serie (l.1557) | `Falta N° de serie` |
| Aviso en el control (l.711-713) | `'Marcado con R' + u + '; ya regía R' + l` · `'Después de este control salió la R' + l` |
| Detalle | `Fotos` (+ ` · n`) · `Cámara` · `Galería` · `Observaciones` · `Fecha` · ayuda `Vacía = hoy al marcar` · `Resp.` · `Instrumento` (+ ` · elegí el N° de serie`) · `'Plano de este control: ' + doc` · `FUM N°` · `Borrar carga` · `Listo` |
| Miniaturas | local: aria `Foto sin enviar. Tocá para quitarla.` · servidor: aria `Ver foto en Drive` |
| FUM | encabezado `num ? 'FUM N° ' + num : 'FUM nueva'` · chips `N° al enviar` / `Abierta` / `Se cierra al enviar` / `Se anula al enviar` / `Cerrada` / `Anulada` / `Sin fecha de reinspección` · meta `'Abierta el ' + fecha` · `Acción inmediata` (vacía `Elegí una`; `Dejar como está`) · `Detalle de la acción inmediata` (placeholder `Ej.: rehacer recubrimiento`) · `Fecha de reinspección` · P2 `Mañana` / `+3 días` / `+1 semana` · ayuda `Se cierra sola cuando marques AP en la reinspección.` |
| Barra | `Siguiente pendiente` + número · completo: `(rz ? 'Sin pendientes' : 'Completo') + ' · ' + ap + ' AP · ' + na + ' N/A · ' + rz + ' RZ'` · botón `'Planilla ' + sheet` |
| Editar datos | `Cancelar` · `Guardar` · toast `Datos del registro guardados` (l.1920) |

#### 7.6 FUM y ¿Quién sos?

| Lugar | Texto |
|---|---|
| Secciones | `'Abiertas · ' + n` · `'Cerradas / anuladas · ' + n` (sin cambios) |
| Chips de fila | `'Vencida · ' + fecha` · `'Reinspección ' + fecha` · `Sin fecha de reinspección` · `Sin enviar` · meta `'Acción: ' + acción` |
| Etiqueta | `'FUM ' + num` / `Nueva` |
| Vacío (l.863) | `No hay FUM abiertas. Se abren solas al marcar RZ.` |
| Pie (l.871) | `Las FUM se abren solas al marcar RZ y se cierran al marcar AP en la reinspección. El análisis de causa y la eficacia se completan en el FOG 01.` |
| ¿Quién sos? | ayuda `Elegí quién sos: tus iniciales se cargan solas en RESP.` · chip `vos` · vacío `No hay responsables cargados en la hoja DATOS del PIE.` · toast `'Vas a firmar como ' + abrev + ' (' + nombre + ')'` |

#### 7.7 Ajustes

| Lugar | Texto |
|---|---|
| Envíos | título `'Envíos pendientes · ' + n` (sin cambios) · `Enviar ahora` · vacío `Todo enviado. No hay nada pendiente.` · `Reintentar` · `Descartar` |
| Título de cada operación (C16) | create `'Registro nuevo · ' + elemento` · update `'Cambios en ' + (elemento \|\| 'fila ' + h) + ' · ' + n + (n === 1 ? ' control' : ' controles')` · photo `'Foto · ' + recorte` · fum `{abrir:'Abrir FUM', cerrar:'Cerrar FUM N° ' + num, anular:'Anular FUM N° ' + num, editar:'Editar FUM N° ' + num}[acc] + ' · ' + recorte`, con `acc = (accion === 'cerrar' && resultado === 'Anulada') ? 'anular' : accion`. `recorte` = cortar en la última palabra completa antes de 40 caracteres y agregar `…` |
| Usuario | sección `Tu usuario` · `'Tus iniciales (' + abrev + ') van en RESP. al marcar'` · `Cambiar` |
| Datos | sección `Datos` · `'Última actualización: ' + ago` · `'Espacio usado en el celular: ' + mb + ' MB'` · botón `Enviar y actualizar ahora` · toast `Todo enviado y actualizado` (l.1717, sólo manual y si salió bien) |
| Conexión | sección `Conexión` · `Enlace de la app (termina en /exec)` · `Clave de acceso` · `Guardar y probar` · `Probando conexión…` → `Conectado al PIE` |
| Validación (l.1928-1930) | `Ese es el enlace de la planilla. Va el de la app: en el PIE, menú PIE › Ver enlace de la app.` / `El enlace tiene que terminar en /exec.` |
| Apariencia | `Apariencia` · `Automático` · `Claro` · `Oscuro` · `Automático sigue el modo del iPhone.` |
| Instalar (l.1692) | `iPhone (Safari): Compartir → Agregar a inicio. Android (Chrome): menú ⋮ → Instalar app. Instalada, abre sin señal.` |
| Sin conexión (l.1696) | `Para abrirla sin señal, usá la app instalada en el celular.` |
| Pie (l.1702) | `'PIE · Carga v' + APP_VERSION + ({pwa:' · app instalada', webapp:' · web', sidebar:' · panel'}[MODE] \|\| '')` · `Recargar app` |
| P2 | `Avisos del PIE` · `Borrar avisos` |

#### 7.8 Errores (traducidos en el frontend; Code.gs no se toca)

| Origen | Texto |
|---|---|
| Falta la URL (l.948) | `Falta el enlace de la app. Pegalo en Ajustes › Conexión.` |
| Respuesta que no es JSON (l.963) | `El enlace no responde como la app PIE. En Apps Script, la implementación tiene que tener acceso «Cualquier persona».` |
| Red o timeout (l.970) | `No hay conexión con el PIE (señal débil). Tus cambios quedan en el celular y se envían solos.` |
| «Error del servidor» (l.942, 965) | `El PIE no respondió. Probá de nuevo en un rato; lo cargado queda en el celular.` |
| `code === 'auth'` | `La clave de acceso no coincide. Copiala del PIE (menú PIE › Ver enlace de la app) en Ajustes › Conexión.` |
| `code === 'busy'` | `El PIE está ocupado con otro envío. Se reintenta solo.` |
| Error por operación (l.1024) | `'No se pudo enviar: ' + msg + '. Queda guardado en el celular; revisalo en Ajustes.'` (err) |
| `code === 'bad_request'` | `Error interno de la app. Tu carga queda guardada en el celular; avisá a quien mantiene la app.` |
| `code === 'conflict'` en update o create | `No encontré el registro en la planilla: puede que se hayan movido filas. Revisá la fila en el PIE y reintentá.` |
| Aviso del servidor (l.1009) | Si coincide con `/No se encontró el criterio "(.+)"/`: `'El control «' + $1 + '» ya no está en la planilla; el resto se guardó.'` (warn). Si no: `'Aviso del PIE: ' + w` (warn) |
| Foto ilegible (l.917) | `No se pudo leer la foto. Sacala de nuevo o elegila de la galería.` |
| Foto sin espacio | `No se pudo guardar la foto en el celular: falta espacio. Liberá espacio y sacala de nuevo.` |
| Foto perdida (l.1036, en `op.error`) | `La foto se borró del celular antes de enviarse. Descartala y sacala de nuevo.` |
| Fotos (l.900, 916) | `Procesando la foto…` / `'Procesando ' + n + ' fotos…'` · `Foto guardada · enviando…` / `Foto guardada en el celular · se envía al tener señal` |

#### 7.9 Hojas `ask()`

| Clave | Título | Cuerpo | Botones (ok · alt · cancelar) |
|---|---|---|---|
| reinsp. (AP sobre FUM) | `¿Pasó la reinspección?` | `'La ' + (num ? 'FUM N° ' + num : 'FUM') + ' se cierra como aprobada, con fecha de hoy.'` | `Cerrar FUM y marcar AP` (ap) · — · `Cancelar` |
| no aplica (N/A sobre FUM) | `¿El control no aplica?` | `'La ' + (num ? 'FUM N° ' + num : 'FUM') + ' se anula en el FOG 01 y el control queda N/A.'` | `Anular FUM y marcar N/A` (danger) · — · `Cancelar` |
| borrar | `¿Borrar la carga de este control?` | `Vuelve a pendiente y se borran fecha, responsable y observaciones. Las fotos quedan.` + (FUM nueva: `\n\nLa FUM nueva se descarta (todavía no se envió).` · FUM numerada: `'\n\nLa FUM N° ' + num + ' queda ANULADA en el FOG 01. Si ya se corrigió, cancelá y marcá AP.'`) | `Borrar carga` o `Borrar y anular FUM` (danger) · — · `Cancelar` |
| plano | `Plano superado` | `'Este registro usa ' + code + ' en R' + u + ' y rige la R' + l + (fecha ? ' (desde ' + fmtDate(fecha) + ')' : '') + '.\nElegí con cuál marcar este control y los siguientes de este registro.'` | `'Pasar a R' + l + ' y marcar'` (primary) · `'Marcar con R' + u` · `No marcar` |
| aprobar | `n === 1 ? '¿Aprobar el control pendiente de ' + st + '?' : '¿Aprobar los ' + n + ' controles pendientes de ' + st + '?'` | `'Quedan AP con fecha de hoy y RESP. ' + me + '.'` | `'Aprobar ' + n` (ap) · — · `Cancelar` |
| P2 tarea N/A | `'¿Marcar N/A los ' + n + ' pendientes de «' + tarea + '»?'` | `'Quedan N/A con RESP. ' + me + '.'` | `'Marcar ' + n + ' N/A'` (primary) · — · `Cancelar` |
| descartar create | `'¿Descartar el registro nuevo «' + el + '»?'` | `Se borra del celular con todo lo cargado (controles, fotos y FUM). No se puede deshacer.` | `Descartar` (danger) · — · `Cancelar` |
| descartar update | `'¿Descartar los cambios en «' + el + '»?'` | `n + (n === 1 ? ' control' : ' controles') + '. Vuelven a como están en el PIE.'` | ídem |
| descartar photo | `¿Descartar esta foto?` | `Todavía no se envió.` | ídem |
| descartar fum abrir | `'¿Descartar la FUM de «' + recorte + '»?'` | `El control queda en RZ sin FUM.` | ídem |
| descartar fum cerrar o editar | `'¿Descartar este cambio de la FUM N° ' + num + '?'` | `La FUM queda como está en el FOG 01.` | ídem |
| quitar foto (l.1753) | `¿Quitar esta foto?` | `Todavía no se envió; se borra del celular.` | `Quitar foto` (danger) · — · `Cancelar` |

#### 7.10 Avisos (toasts)

| Evento | Tipo | Texto |
|---|---|---|
| Tocar el estado ya activo | info | `'Ya está en ' + EST[st] + '. Para borrarlo: Detalle › Borrar carga.'` |
| FUM retenida descartada | info | `FUM descartada: no se había enviado.` |
| Cierre o anulación encolados | ok + Deshacer | `'FUM N° ' + num + ' se cierra al enviar'` / `'FUM N° ' + num + ' se anula al enviar'` (sin número: `La FUM se cierra al enviar` / `La FUM se anula al enviar`) |
| Borrar carga | ok + Deshacer | `Carga borrada` |
| Aprobar | ok + Deshacer | `n === 1 ? '1 control aprobado' : n + ' controles aprobados'` |
| Después de Deshacer | info | `Listo, se deshizo` |
| Deshacer imposible | err | `No se puede deshacer: la FUM ya se cerró en el FOG 01.` |
| FUM numerada por el PIE | ok | `'FUM N° ' + r.fum + ' abierta en el FOG 01'` |
| Plano elegido (l.1773, 1780) | ok | `'Plano: ' + val + (n ? ' · aplicado a ' + n + (n === 1 ? ' control' : ' controles') : '')` |
| Pasar a la revisión vigente (l.1833) | ok | `'Registro pasado a R' + l + (n ? ' · ' + n + (n === 1 ? ' control actualizado' : ' controles actualizados') : '')` |
| Sin inspector | info | `Primero elegí quién sos` |
| Versión nueva | info + `Recargar` | `Hay una versión nueva de la app` |

---

### 8. Pruebas

#### 8.1 Cambios en `test/e2e.test.js`

| Línea | Hoy | v1.6 |
|---|---|---|
| 55 | `#modal .doc:has-text("Rev 7")` | `#modal .doc:has-text("R07")` |
| 63 | `text=Nuevo · se crea en la planilla al sincronizar` | `text=se crea en el PIE al enviarse` |
| 64 | `.net:has-text("Offline")` | `.net:has-text("Sin señal")` |
| 75 | `.fumbox:has-text("se numera al sincronizar")` | `.fumbox:has-text("FUM nueva")` |
| 91 | `/Offline · \d+ sin enviar/` | `/Sin señal · \d+/` |
| 141-142 | `page.fill('[data-regdoc]', …)` + `blur()` | `await page.click('button[data-act=docpick][data-target=default]'); await page.fill('#modal input[data-input=docq]', '_KIR-COMR-REF-ESTR-S12P-R06'); await page.click('#modal [data-act=pickfree]');` |
| 143 | `text=Plano superado (FOD 02).` | `.note.err:has-text("Plano superado")` |
| 146 | `…querySelector('[data-regdoc]').value === 'KIR-COMR-REF-ESTR-S12P-R07'` | `…querySelector('[data-regdoc]').dataset.value === 'KIR-COMR-REF-ESTR-S12P-R07'` |
| después de 150 | (`confirm` aceptado por `page.on('dialog')`) | `await page.click('#ask [data-ans=ok]');` |
| 172 | `sizes[0] >= 48 && sizes[1] >= 48 && sizes[2] >= 44` | `sizes[0] >= 56 && sizes[1] >= 56 && sizes[2] >= 48` |

- **Línea 171 sin cambios:** `.acts .more` sigue existiendo.
- **Línea 16:** `page.on('dialog')` queda como red de seguridad.
- **Tiempos:** el cierre de la línea 150 se retiene 6 s y después se envía a los 300 ms. «Al día» llega en unos 7-9 s, dentro de los 20 s de la línea 151.

#### 8.2 Pasos nuevos (insertar entre las líneas 172 y 174)

```js
// 6e. Doble toque no desmarca; RZ corregido con el detalle abierto no crea FUM; con filtro, lo marcado no desaparece
await page.dblclick('.item >> nth=5 >> button[data-st=na]');
assert.ok(await page.$eval('.item >> nth=5', e => e.classList.contains('na')), 'el doble toque no desmarca');
await page.click('.item >> nth=6 >> button[data-st=rz]');
await page.waitForSelector('.item >> nth=6 >> .fumbox');
await page.waitForTimeout(800);                                   // pasa el bloqueo de 700 ms del control
await page.click('.item >> nth=6 >> button[data-st=na]');         // FUM retenida → se descarta sin preguntar
assert.strictEqual(await page.$$eval('.item >> nth=6 >> .fumbox', n => n.length), 0, 'sin FUM');
await page.click('.item >> nth=6 >> button:has-text("Listo")');
await page.click('button[data-f=pend]');
const nPend = await page.$$eval('.item', n => n.length);
await page.click('.item >> nth=0 >> button[data-st=na]');
assert.strictEqual(await page.$$eval('.item', n => n.length), nPend, 'el control marcado sigue en la lista');
await page.click('button[data-f=all]');
await page.waitForFunction(() => document.querySelector('.net').textContent.includes('Al día'), null, { timeout: 20000 });
```

- Se usa N/A y no AP para que la línea 176 siga esperando 4 controles AP.
- Las líneas 179-180 («Abiertas · 0», «Cerradas / anuladas · 1») prueban que no se creó ninguna FUM.

**Agregar después de la línea 61 (Nuevo) y después de la 186 (Ajustes):**

```js
assert.strictEqual(await page.$$eval('input:not([type=file]), select, textarea', els => els.filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length), 0, 'campos ≥ 16 px');
```

**Opcional, al final del paso 9:**

```js
await page.setViewportSize({ width: 320, height: 568 });
// ir a un registro y verificar que no hay overflow horizontal,
// que .acts .st mide ≥ 56 de alto y que textContent('.net') sigue
// conteniendo el texto completo en modo compacto
```

#### 8.3 Selectores y textos que hay que conservar

- **Clases y estructura:**
  - `.row` y `.row:has-text("HORMIGON ARMADO")` (una sola coincidencia);
  - `button[data-tab=reg|req]` y `.fab`;
  - `input[name=elemento|piso|sector|etapa|documento]`;
  - `button[data-act=docpick][data-target=new]`;
  - `#modal .doc`, `#modal input[data-input=docq]`, `#modal [data-act=pickdoc]` (uno por código) y `[data-act=pickfree]`;
  - `button[type=submit]` (único).
- **Registro:**
  - `.item`, `.item.pend`, `button[data-st=ap|rz|na]` y `.acts .st`;
  - `button[data-act=more]` (con el detalle cerrado hay uno solo por control) y `.acts .more`;
  - `.fumbox`, `[data-fum=accionCorrectiva|plazo]`, `[data-field=obs|instrumento]`;
  - `button:has-text("Listo")` dentro de `.item` e `input[data-photo][multiple]`;
  - `.thumbs .t img` y `.thumbs .t i`;
  - `[data-regdoc]` y `button[data-act=docupdall]`;
  - `button[data-act=nextpend]`, `button[data-act=fold]` y `button[data-f=ap|pend|all]`.
- **Textos:**
  - `text=FUM 4 abierta` dentro de `.item`;
  - `#hdr` con «Planilla 6 · fila N» y «cambios sin enviar»;
  - `.net` con «Al día» y «Sin señal»;
  - «Abiertas · 0» y «Cerradas / anuladas · 1»;
  - `[data-to="/ajustes"]` en FUM;
  - «Envíos pendientes · 0»;
  - los nombres tal como están en DATOS;
  - sin overflow horizontal.

#### 8.4 `test/static.test.js` (nuevo, Node, sin navegador)

Falla si se cumple alguna de estas condiciones:

1. `apps-script/Index.html` no es idéntico a `app/index.html`.
2. `sw.js` no contiene `'pie-carga-v' + APP_VERSION`.
3. `index.html` contiene `confirm(`.
4. Aparece algún glifo de `/[\u{1F300}-\u{1FAFF}⚙⚠⏳⋯▾▸▴✕＋]/u`.
5. Hay una URL `http(s)://` que no sea `drive.google.com/thumbnail` ni `script.google.com` (este último sólo dentro de textos de ayuda).

También se corre `node test/backend.test.js wb.json fod.json fog.json`, que no cambia.

---

### 9. Aceptación y entrega

**Lista de aceptación (todo en verde antes de entregar):**

- [ ] `node test/e2e.test.js` (con los cambios de §8.1 y §8.2), `node test/backend.test.js wb.json fod.json fog.json` y `node test/static.test.js` en verde.
- [ ] Capturas nuevas de las 16 pantallas en claro, oscuro y chico (320×568), comparadas con `ui/antes/`:
  - [ ] Registro (07): la tarjeta de resumen mide ≤ 160 px en el SE y el criterio del primer control se ve. En el 13 (390×664), AP/RZ/N/A del primer control quedan por encima de la barra.
  - [ ] Nada tapa campos ni botones en 08, 09 y 10. Con el detalle a la vista, la barra está oculta.
  - [ ] Los 5 filtros entran sin desplazamiento a 300 y 320 px.
  - [ ] Ningún chip se sale de su tarjeta (13 en el SE).
  - [ ] Un aviso corto entra en una línea, arriba y bajo el header.
  - [ ] En modo oscuro, AP/RZ/N/A marcados, el botón principal y los avisos se leen bien.
  - [ ] Sin scroll horizontal a 300, 320, 375 y 412 px.
- [ ] `grep -nE '#[0-9a-fA-F]{3,6}\b' app/index.html` sólo devuelve líneas de los bloques de tokens, los data-URI y las metas `theme-color`.
- [ ] Ningún `style=` en el JS salvo `width:` de los segmentos de `.bar`.
- [ ] Ningún texto informativo por debajo de 14 px y ningún campo por debajo de 16 px.

**Verificación en el iPhone de Federico** (Safari, app instalada; Chromium no reproduce nada de esto):

1. Borrar el ícono y volver a «Agregar a inicio». iOS fija las metas al instalar; sin reinstalar no toma la barra de estado ni los colores nuevos.
2. La barra de estado queda integrada al header navy, sin franja.
3. Tocar cada campo no hace zoom.
4. Con el teclado abierto, la barra inferior se esconde.
5. Doble toque con guante sobre AP: no desmarca.
6. RZ, AP con el detalle abierto, «Al día»: en el FOG 01 no aparece ninguna FUM.
7. RZ, Listo, «Borrar carga», «Deshacer»: la FUM queda intacta.
8. Campos de fecha bien alineados en el SE.
9. Modo oscuro al atardecer con Automático, y Claro forzado desde Ajustes.
10. Panel de Sheets a 300 px.

**Entrega (CLAUDE.md):**
- `APP_VERSION = '1.6.0'`, `CACHE = 'pie-carga-v1.6.0'` y `cp app/index.html apps-script/Index.html` (confirmar con `diff -q`).
- Rama `claude/pie-carga-movil`, carpeta `pie-app/` del repositorio `fedecalzon/CLAUDE-KIR`.
- Un único `PIE-v1.6.zip` enviado por el chat, con carpetas numeradas por paso de instalación.
- Avisarle a Federico tres cosas:
  - dónde quedó cada archivo;
  - que desde la nube no se puede escribir en su computadora y tiene que descargarlo del chat (queda en Descargas);
  - que tiene que reinstalar el ícono.
- README: instrucciones de iPhone primero, reinstalación del ícono y el nuevo glosario («enviar» y «actualizar»).

---

### 10. Fuera de la v1.6

| Hallazgo | Motivo |
|---|---|
| C06 (backend), C13 (Code.gs l.588, 1362), C14 (l.336), C15 (l.95, 270) | Tocan Code.gs. El frontend ya traduce por `code`, y N/A sobre una FUM usa `Anulada`. Va como parche aparte (ver ideas). |
| PROD-01, 02, 04, 05, 07, 09-14, FLOW-04(b), FLOW-14, FLOW-16 (propagación) | Son funciones nuevas: van al ranking. |
| FLOW-05 (colapsar los ya marcados, avance automático) | Mueven controles bajo el dedo. El filtro «Pend.» con `keep` cubre el ahorro. |
| FLOW-09: hoja «Envíos» propia | El indicador lleva a Ajustes › Envíos, y las filas llevan al registro. |
| FLOW-13: tarea en la banda fija | Header, etapa y tarea sumarían unos 150 px fijos sobre 568. |
| a11y-02: ⋯ fuera de la fila; orden AP · N/A · RZ | El primero alarga las tarjetas y aleja el pulgar. El segundo rompe la memoria muscular de la v1.5: hay que probarlo antes con Federico. |
| a11y-07: segundo botón alternador en la barra | Un solo botón claro. Los filtros quedan arriba. |
| a11y-08: modo «Sol» y `prefers-contrast`; a11y-09: Dynamic Type | La paleta ya da ≥ 6:1 en texto y ≥ 3:1 en bordes. Pasar todo a rem rompe 300-320 px. |
| eng-01 (render parcial) como obligatorio | Mide 13-15 ms. Queda en P2. |
| eng-09 (fotos como Blob), eng-17 (miniaturas de fotos ya enviadas), PROD-02 con fotos | Cambian lo guardado en el celular o el backend. |
| eng-13: `pushState` del modal | Sin gesto de volver en iPhone instalado. El resto de eng-13 entra. |
| eng-19: `"id"` en el manifest, `apple-touch-icon`, pegar el enlace de configuración | El `id` cambia la identidad de la app en Android. El ícono necesita un archivo que Apps Script no sirve. Pegar el enlace va al ranking. |

---

## Ideas funcionales

Ordenadas por valor sobre esfuerzo. «N/A a la tarea», «Seguir donde estaba» y los atajos de fecha ya entran como P2 de la v1.6 y no se repiten acá; si no llegan, encabezan la v1.7.

| # | Idea | Para qué le sirve en obra | Esfuerzo | ¿Apps Script? |
|---|---|---|---|---|
| 1 | **Búsqueda global con veredicto de plano** (PROD-01) | Escribe «losa 5P», «S12P R06» o «FUM 4» y llega directo al registro, o sabe al instante si el plano impreso que tiene en la mano está VIGENTE o SUPERADO, sin señal. | S | No |
| 2 | **Duplicar registro / Nuevo similar** (PROD-07, FLOW-14) | La losa del piso siguiente se crea con elemento, plano, responsables y modelo ya cargados: sólo cambia el piso, con chips de los pisos ya usados. | S | No |
| 3 | **Compartir la FUM por WhatsApp** (PROD-02, sólo texto) | Al marcar RZ, avisa al capataz o al subcontratista con un toque: N°, elemento, piso, criterio, acción y fecha de reinspección, sin redactar a mano. | S | No |
| 4 | **Aviso de planos nuevos del FOD 02** (PROD-05) | Al actualizar, ve «S12P: R06 → R07, afecta a Losa L5 y Vigas 11» y pasa esos registros a la vigente en un toque, antes de ejecutar con un plano viejo. | S | No |
| 5 | **N° de serie para todo el registro** (FLOW-16) | Elige el N° del nivel una vez y se aplica a los controles ya marcados del mismo tipo («aplicado a 6 · Deshacer»). La memoria vale sólo por el día. | S | No |
| 6 | **Agenda de reinspecciones** (PROD-03, resto) | Rechazos · FUM ordenado como agenda: Vencidas / Hoy / Esta semana / Sin fecha. Inicio muestra «2 reinspecciones hoy». | S | No |
| 7 | **Informe PDF del registro** (PROD-09) | Protocolo de liberación para la dirección de obra, COMAFI o una auditoría, con plano y revisión, estados, FUM y fotos, generado desde el celular. | M | Sí: acción `informe` y conversión con Drive |
| 8 | **Parche de textos en Apps Script** (C06, C13-C15 backend) | El FOG 01 deja de decir «Reinspección aprobada (No aplica)» y los mensajes de error del PIE dicen qué hacer. | S | Sí |
| 9 | **Equipos de medición con vencimiento de calibración** (PROD-04) | Ve «NIVEL LASER (1167) · vence 12/03/27» al elegir el instrumento, y la app avisa si está vencido (ISO 7.1.5). | S-M | Sí: tabla nueva en DATOS y `datos.equipos` |
| 10 | **Liberación de etapa con checklist** (PROD-11) | «Liberar PRE» deja constancia de quién liberó y cuándo, y no deja cerrar con FUM abiertas, plano superado o instrumentos sin N° de serie (ISO 8.6). | M | Sí: hoja `_PIE_LIBERACIONES` |
| 11 | **Tablero de avance piso × rubro** (PROD-10) | Para la reunión de obra: qué pisos tienen controles abiertos, el % de AP a la primera y los registros estancados hace más de 30 días. | M | No |
| 12 | **Historial de cambios por control** (PROD-13) | Ante una auditoría o un reclamo del subcontratista, sabe quién cambió cada control y cuándo, y se entera si otro inspector lo pisó. | M | Sí: hoja `_PIE_HIST` y acción `historial` |
| 13 | **Avisos por mail** (PROD-12) | Cada mañana recibe las reinspecciones del día y las FUM vencidas, y los lunes el resumen de calidad, sin abrir la app. | M | Sí: tareas programadas y permisos de mail |
| 14 | **Copiar los N/A del modelo al crear** (FLOW-04b) | Ahorra unos 20 toques por registro cuando el elemento es igual al anterior. Hay que acordar con Federico si es aceptable para la auditoría ISO. | S | No |
| 15 | **Hitos contra el cronograma** (PROD-14) | «El hormigonado de la losa 6P es el jueves y el PRE no está liberado»: semáforo de puntos de espera en Inicio. | L | Sí: hoja HITOS o lectura del PDT |