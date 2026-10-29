# 4 · Método de trabajo para el front

## Requisitos

- **Node 18 o más nuevo.** Las pruebas y el entorno local no tienen dependencias: no hace falta `npm install`.
- Playwright con Chromium, solo para las pruebas de interfaz en navegador. Es opcional.
- Python 3 con `openpyxl` y `pdf2image`/`Pillow`, solo para exportar planillas o convertir planos. Es opcional.

## Entorno local (sin Google)

`herramientas/dev-server.js` levanta dos servidores en la PC:
- la app (`pwa/`);
- una imitación de la web app `/exec`, que ejecuta los **`Code.gs` y `Beta.gs` reales** sobre la planilla exportada a JSON (`herramientas/test-v2/fake-gas.js` imita SpreadsheetApp, DriveApp, etc.).

```sh
cd pie-app
npm run dev          # = node herramientas/dev-server.js ../datos-prueba/wb.json ../datos-prueba/fod.json --planos ../datos-prueba/planos
# App:  http://localhost:8080/?api=http%3A%2F%2Flocalhost%3A8081%2Fexec&token=dev
```

Notas:
- Abrir la URL que imprime. Ya trae la configuración. Para verla como en el iPhone: DevTools › modo dispositivo (iPhone 12/13, 390×844).
- Lo que se carga (altas, AP/RZ, FUM, pines, fotos) se escribe en la planilla **en memoria**. Al cortar el servidor se pierde todo, así que se puede probar sin miedo.
- Para ver qué quedó escrito: `http://localhost:8081/__sheet?name=25&from=180&to=200`.
- **No usa service worker**: cada recarga trae el `index.html` recién editado. Para probar el service worker, agregar `--sw` (y después «Borrar datos del sitio» en DevTools).
- Para simular sin señal: DevTools › Network › Offline. La cola queda en IndexedDB (DevTools › Application).
- Para empezar de cero: DevTools › Application › Clear site data.

## Ciclo de un cambio

1. Editar **solo `pwa/index.html`**.
2. Probar en el entorno local (recargar).
3. Copiar el archivo al de Apps Script, que tiene que quedar idéntico:
   ```sh
   cp pwa/index.html apps-script/Index.html      # o: npm run copiar-html
   ```
4. Si cambió algo que el usuario va a notar, subir la versión en **los 4 lugares**:
   - `APP_VERSION` en `pwa/index.html`;
   - `CACHE` en `pwa/sw.js`;
   - `PIE.VERSION` en `apps-script/Code.gs`;
   - `version` en `package.json`.
   Se usa semver: 2.3.1 → 2.3.2 para arreglos, 2.4.0 para funciones nuevas.
5. Correr las pruebas (abajo). Tienen que pasar todas.
6. Para que llegue a la obra:
   - Pegar `Index.html` (y `Code.gs`/`Beta.gs` si cambiaron) en el editor de Apps Script de la planilla PIE - CORE.
   - Ir a **Implementar › Administrar implementaciones › ✏️ › Nueva versión**. El enlace `/exec` no cambia.
   - En el celular: abrir la app con señal, «Recargar» si lo pide, y después Ajustes › Enviar y actualizar ahora.

> Antes de publicar, pedir a quien use la app que la abra con señal y espere «Al día». Una versión nueva no pierde la cola, pero conviene no dejar nada sin enviar.

## Pruebas

```sh
node herramientas/comprobar.mjs     # sintaxis de los .gs/.js/.json e igualdad Index.html == pwa/index.html
npm test                            # = node tests/beta.test.mjs, gestures, pin_colors, beta4  (45 + 12 + 10 + 6)
PIE_VER=. PIE_PLANOS=../datos-prueba/planos node herramientas/test-v2/final.test.js ../datos-prueba/wb.json ../datos-prueba/fod.json   # 7 pruebas contra el libro real
```

| Prueba | Qué cubre |
|---|---|
| `tests/beta.test.mjs` | Reglas de liberación (`RL`), bloque idéntico en Beta.gs y en el HTML, planos.json, fotos y lotes. |
| `tests/gestures.test.mjs` | **Ejecuta las funciones reales del visor** (`plGestures`) con un DOM simulado: pellizco, arrastre, pérdida de captura. |
| `tests/pin_colors.test.mjs` | Colores de pines y zonas por estado y color manual. |
| `tests/beta4.test.mjs` | Foto general, borrar marca + Deshacer. |
| `herramientas/test-v2/final.test.js` | Contra el libro real: lectura de las 47 planillas, alta, AP/RZ, FUM, liberación aceptada y bloqueada, planos. |
| `tests/pwa_smoke.py`, `tests/registro_planos_smoke.py` | Recorridos en Chromium (Playwright para Python) con API simulada. |

Las pruebas de Node extraen funciones del HTML por nombre. **Si se renombra o mueve una función del visor o del bloque `RL`, revisar la prueba que la busca.**

### Pruebas a mano con Playwright (Node)

```js
const { chromium, devices } = require('playwright');
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
await p.goto('http://localhost:8080/?api=' + encodeURIComponent('http://localhost:8081/exec') + '&token=dev');
await p.waitForSelector('.net.ok');            // «Al día»
await p.waitForTimeout(500);                   // el filtro anti doble toque descarta clicks a < 350 ms
```

## Reglas del proyecto (no negociables)

1. **El backend sigue siendo Google Apps Script sobre la planilla.** No migrar a Supabase ni a otra base. La rama `claude/dazzling-lovelace-r5zs5t` no se usa.
2. `apps-script/Index.html` es **copia exacta** de `pwa/index.html`. `comprobar.mjs` lo verifica.
3. El bloque `/* <reglas-liberacion> … /* </reglas-liberacion> */` es **idéntico** en `Beta.gs` y en `pwa/index.html`. Si se cambia una regla, se cambia en los dos lugares.
4. Un solo archivo HTML, sin librerías externas ni CDN: la app tiene que abrir dentro de Apps Script y sin señal.
5. JS en ES5. Nada de `=>`, `let`, `const` ni template strings dentro del `<script>` de la app.
6. Colores solo con tokens. Un color nuevo se agrega al bloque de tokens, en claro y en los **dos** bloques oscuros.
7. Textos en español rioplatense y en palabras de obra. Errores traducidos por `code` en `ERR`. Sin `alert`/`confirm`: usar `toast` y `ask`.
8. Ninguna acción del usuario llama al servidor directamente: todo pasa por la cola (`S.queue`) y `sync()`. Las operaciones tienen `id` y son idempotentes.
9. Las imágenes `.webp` de los planos y los datos de la obra (`wb.json`, `fod.json`) **no se suben al repositorio** porque es público.
10. Probar con el **teléfono como referencia**: 390 px de ancho, una mano, guantes, sol, señal débil.

## Dónde está cada cosa

- Repositorio: GitHub `fedecalzon/CLAUDE-KIR`, rama `claude/pie-carga-movil`, carpeta `pie-app/`.
- La planilla y Apps Script los administra Federico (menú **PIE** en la planilla PIE - CORE).
- Las láminas `.webp` y `planos.json` están en Drive › «PIE - Fotos de control» › «Planos».
- Para agregar láminas: `python herramientas/pdf-a-planos.py --planilla <n> --salida <carpeta> "<plano.pdf>:<páginas>"`. Después, sumar las entradas a `planos/planos.json` y subir las imágenes y el json a Drive.
