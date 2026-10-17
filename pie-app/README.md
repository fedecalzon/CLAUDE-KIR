# PIE · Carga móvil de inspecciones (FOP 01)

App para cargar los **Planes de Inspección y Ensayo** de la planilla `PIE - CORE` desde el celular, con o sin señal.

- Muestra las planillas **agrupadas por rubro** (Estructuras, Instalaciones, Terminaciones…) y, en cada una, los **requisitos** (PRE / DURANTE / POST / DOC → tarea → criterio, método e instrumento) y los **registros** ya ejecutados con su avance (AP / RZ / N/A / pendientes).
- **Nuevo registro**: copia el bloque modelo de esa planilla (formato, celdas combinadas, validaciones y alto de filas) y lo pega **debajo del último registro**, respetando la separación que ya usa la hoja. Completa RESPONSABLE, PISO, SECTOR, ETAPA, ELEMENTO A VERIFICAR y el DOCUMENTO de referencia.
- **Checklist**: botones AP / RZ / N/A por criterio. AP/RZ completan solos FECHA (hoy), RESP. (tus iniciales) y DOCUMENTO; RZ abre FUM N° y observaciones. N/A escribe `NA` en FECHA, como se viene haciendo.
- **Sin señal**: todo queda guardado en el celular y se envía solo al volver la conexión. Los envíos no se duplican aunque se corte a mitad de camino (cada operación tiene un id registrado en la hoja oculta `_PIE_LOG`).

## Contenido

| Carpeta | Qué es |
|---|---|
| `apps-script/` | Lo que se pega en el editor de Apps Script de la planilla: `Code.gs`, `Index.html`, `appsscript.json`. |
| `app/` | La misma app como PWA instalable (abre sin señal): `index.html`, `sw.js`, `manifest.webmanifest`, íconos. |
| `test/` | Pruebas con un simulador de Google Sheets cargado con el libro real (no hace falta para usar la app). |

`apps-script/Index.html` es una copia exacta de `app/index.html`: si modificás una, copiá a la otra.

## 1. Pasar la planilla a Google Sheets

Apps Script sólo funciona sobre Google Sheets (el archivo hoy está en SharePoint).

1. Subí `PIE - CORE.xlsx` a Google Drive → clic derecho → **Abrir con › Hojas de cálculo de Google** → **Archivo › Guardar como Hojas de cálculo de Google**.
2. Revisá que la hoja `DATOS` tenga los responsables (D12:E…) y sus abreviaturas. Algunas fórmulas de la columna A en bloques viejos apuntan a otro libro (`[1]DATOS`); en los bloques nuevos la app escribe `=IFERROR(VLOOKUP(B…,DATOS!$D$12:$E$60,2,0),"")`.

## 2. Instalar el script

1. En la planilla: **Extensiones › Apps Script**.
2. Reemplazá el contenido de `Código.gs` por `apps-script/Code.gs`.
3. **＋ › HTML**, nombre `Index` (sin `.html`), pegá `apps-script/Index.html`.
4. **Configuración del proyecto › Mostrar el archivo de manifiesto "appsscript.json"** y pegá `apps-script/appsscript.json`.
5. Guardá, volvé a la planilla y recargala: aparece el menú **PIE**. La primera vez pide autorización.
6. **PIE › Configurar clave de acceso**: elegí una clave (la va a pedir la app del celular).

Con eso ya podés usar **PIE › Abrir carga PIE (panel)** desde la compu (botón “Ver fila” lleva al bloque en la planilla).

## 3. Publicar para el celular

En Apps Script: **Implementar › Nueva implementación › Aplicación web**

- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier persona** (la protección es la clave del paso 2.6)

Copiá la URL que termina en `/exec`.

### Opción A — abrir la URL directo (más simple)
Abrís la URL `/exec` en el celular y la agregás a la pantalla de inicio. Si se corta la señal **con la app abierta**, seguís cargando y se envía al volver. Lo que no puede es *abrirse* sin señal (Google no permite service workers en Apps Script).

### Opción B — PWA instalable (abre sin señal desde cero)  ✅ recomendada para obra
1. Publicá la carpeta `app/` en cualquier hosting HTTPS estático, por ejemplo:
   - **Netlify Drop** (app.netlify.com/drop): arrastrás la carpeta `app` y te da una URL.
   - **GitHub Pages** en un repo público con la carpeta `app/`.
2. Abrí una vez en el celular: `https://TU-HOSTING/index.html?api=URL_EXEC&token=TU_CLAVE`
   (la app guarda la conexión y borra los parámetros de la barra). Ese enlace podés mandárselo al resto del equipo.
3. Chrome Android: menú ⋮ › **Instalar app**. iPhone/Safari: compartir › **Agregar a inicio**.
4. Con señal, tocá **Sincronizar y descargar todo** en Ajustes: a partir de ahí abre y carga sin conexión.

Cada vez que publiques una nueva versión del script, usá **Implementar › Administrar implementaciones › editar › Nueva versión** para conservar la misma URL.

## Cómo decide dónde y qué copiar

- Un bloque se reconoce por la fila **TAREA**; el encabezado (RESPONSABLE, PISO, SECTOR, ETAPA, ELEMENTO A VERIFICAR) se busca en las filas de arriba. Las columnas se ubican por el rótulo, así funciona aunque una hoja las tenga corridas (p. ej. la 16 usa L/M/N/O para RESP./ESTADO/FUM/OBS.).
- **Modelo**: por defecto el último registro de la hoja; si ese bloque no tiene la fila de título RESPONSABLE (pasa en la hoja 20), usa el último que sí la tenga con los mismos criterios. En el formulario podés elegir otra variante de criterios si la hoja tiene más de una (p. ej. hormigón con “Preparación de superficie para refuerzo”).
- **Ubicación**: debajo de la última fila con contenido + la misma cantidad de filas vacías que separa los dos últimos bloques (entre 1 y 3).
- Si la planilla estaba **oculta**, se vuelve a mostrar al crear un registro.
- Las actualizaciones verifican que cada fila siga teniendo el mismo criterio; si alguien insertó filas a mano, lo busca por texto. Si no lo encuentra, el envío queda marcado en **Ajustes › Envíos pendientes** para reintentar o descartar.

Para cambiar la agrupación por rubro, editá `PIE.RUBROS` al principio de `Code.gs`.

## Pruebas (opcional, para desarrollo)

```bash
# exportar el libro a JSON (python3 + openpyxl) y correr las pruebas del backend
python3 test/export_xlsx.py "PIE - CORE.xlsx" wb.json
node test/backend.test.js wb.json
# servidor local que simula la web app + prueba E2E en celular emulado (Playwright)
node test/server.js wb.json 8080 &
node test/e2e.test.js capturas/
```
