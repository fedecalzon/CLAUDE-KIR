# PIE · Carga móvil de inspecciones (FOP 01)

App para cargar los **Planes de Inspección y Ensayo** de la planilla `PIE - CORE` desde el celular, con o sin señal.

- Muestra las planillas **agrupadas por rubro** (Estructuras, Instalaciones, Terminaciones…) y, en cada una, los **requisitos** (PRE / DURANTE / POST / DOC → tarea → criterio, método e instrumento) y los **registros** ya ejecutados con su avance (AP / RZ / N/A / pendientes).
- **Nuevo registro**: copia el bloque modelo de esa planilla (formato, celdas combinadas, validaciones y alto de filas) y lo pega **debajo del último registro**, respetando la separación que ya usa la hoja. Completa RESPONSABLE, PISO, SECTOR, ETAPA, ELEMENTO A VERIFICAR y el DOCUMENTO de referencia.
- **Documento desde el FOD 02**: botón “FOD 02” en el alta, en “Documento al aprobar” y en cada control. Despliega el Registro de Control y Distribución de Documentos mostrando **sólo la última revisión de cada código** (buscador + filtro por categoría, avisa si figura “No vigente” o “No aprobado”) y escribe `CÓDIGO-Rnn` en la columna DOCUMENTO. También acepta texto libre.
- **Fotos de control**: en el detalle de cada control, botones Cámara / Galería. La foto se achica en el celular (~1600 px), queda guardada sin señal y se sube sola a Drive (carpeta `PIE - Fotos de control - …/<planilla>`). En la planilla queda una **nota en la celda de OBSERVACIONES** con el enlace, y un índice en la hoja oculta `_PIE_FOTOS`.
- **Documento superado**: cada DOCUMENTO cargado se cruza con el FOD 02 (entiende `-R06`, `_07`, ` REV. 12`, varios documentos separados por `//`). Si un control pendiente usa una revisión reemplazada avisa “Documento superado · vigente R07” con botón **Usar R07**; si un control ya hecho se registró con una revisión que ya estaba reemplazada ese día, lo marca en rojo. Al marcar AP/RZ con un documento superado pregunta si usar la revisión vigente. Las planillas y registros afectados muestran “⚠ doc. superado”.
- **FUM (rechazos) en el FOG 01**: al marcar **RZ** se abre una FUM. Si el **FOG 01 (Formulario Único de Mejoras)** está vinculado (menú **PIE › Vincular FOG 01**), se agrega una fila con el formato de las anteriores y el número correlativo del FOG (sigue después del último), con Origen “Inspección Interna”, Procesos “Producción”, fecha, descripción del desvío (planilla, elemento, piso, criterio y observación), quién lo registró, acción inmediata (Reparar / Recambio / Recalificar / Dejar como está), descripción y plazo en días. Si la tabla llega a la leyenda de abajo, inserta filas en vez de pisarla. El número se escribe en la columna FUM N° del PIE. Al marcar **AP** en la reinspección se completa “Cierre de la Acción Inmediata” y su fecha; desmarcar el RZ la anula. El análisis de causa, la acción de mejora y la verificación de eficacia se siguen completando en el FOG 01. Si alguien cierra la acción inmediata a mano en el FOG 01, la app lo toma. Pantalla **Rechazos · FUM** con las abiertas, días abiertas y reinspecciones vencidas. Funciona sin señal (se numera al sincronizar). La relación FUM ↔ control del PIE se guarda en la hoja oculta `_PIE_FUM`.
- **Instrumento con N° de serie**: en el detalle del control se elige el instrumento de la lista de **DATOS (columna INSTRUMENTO)**, primero los del mismo tipo (p. ej. `NIVEL LASER (1167)`), y se escribe en la columna INSTRUMENTO en lugar de “INDIQUE NO. SERIAL”. La app recuerda tu elección y la completa sola en los próximos controles de ese tipo; si falta, avisa “Indicar N° de serie”. Para que aparezcan tus equipos, agregalos con su número en DATOS › INSTRUMENTO.
- **Fotos rastreables**: cada foto se guarda en `PIE - Fotos de control › <planilla> › Fila <fila del registro> - <elemento> - <piso>` con nombre `PIE-<planilla>_F<fila del control>_<elemento>_<tarea>_<fecha>_<hora>_<inspector>_<nn>.jpg` (ej. `PIE-6_F780_Bajo-recorrido-TN1-TN2-LN3-LN2_Encofrados_2026-10-18_0941_FC_01.jpg`), con la descripción completa del control en el archivo. Sólo se aceptan imágenes de hasta ~10 MB.
- **Siguiente pendiente**: barra inferior que lleva al próximo control sin marcar (se esconde con el teclado o con un detalle abierto); las etapas PRE / DURANTE / POST / DOC se pliegan tocando su banda, que queda fija arriba mientras se recorre. Botones AP / RZ / N/A de 56 px con ícono, color y texto (no dependen sólo del color) y contraste AA en modo claro y oscuro, para usar al sol y con guantes.
- **Plano único por registro**: el plano (FOD 02) se elige una sola vez arriba del registro y se aplica a todos los controles pendientes; se pueden sumar más planos (“＋ Otro plano”, quedan separados por `//`). Si se cambia, se actualizan los pendientes y los ya controlados conservan el plano con el que se hicieron (trazabilidad). Los controles ya no tienen campo de documento propio; sólo muestran “Plano: …” cuando difiere del del registro.
- **Checklist**: botones AP / RZ / N/A por criterio. AP/RZ completan solos FECHA (hoy), RESP. (tus iniciales) y DOCUMENTO; RZ abre FUM N° y observaciones. N/A escribe `NA` en FECHA, como se viene haciendo.
- **Marcado seguro (v1.6)**: un doble toque no desmarca; una RZ por error corregida con el detalle abierto no llega al FOG 01; **Borrar carga** pregunta y ofrece **Deshacer**; con un filtro activo, lo recién marcado no desaparece bajo el dedo. Las preguntas usan una hoja propia con botones que dicen qué pasa (no los cuadros del navegador). El plano superado se pregunta una sola vez por registro.
- **Atajos (v1.6)**: «Aprobar los N pendientes» al final de cada etapa, **N/A a la tarea** (con Deshacer), fecha de reinspección de un toque (Mañana / +3 días / +1 semana) y **Seguir** en Inicio con los últimos registros abiertos.
- **Indicador de envíos**: «Al día» (todo en el PIE), «Sin enviar · n» (hay cambios sólo en el celular), «Sin señal · n» y «Revisar» en rojo si un envío falló; tocándolo se envía o se va a Ajustes › Envíos pendientes. **Apariencia** Automático / Claro / Oscuro en Ajustes.
- **Glosario de la app**: *enviar* = del celular al PIE; *actualizar* = del PIE al celular; *plano* = el documento del FOD 02; *planilla* = la hoja numerada; *control* = cada línea con AP / RZ / N/A.
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
5. Guardá. En la barra de arriba del editor elegí la función **autorizar** y tocá **▶ Ejecutar**: Google pide los permisos (planillas, Drive y menús) y hace una prueba de escritura en Drive (la necesitan las fotos); aceptalos (si dice "Google no verificó esta app": Configuración avanzada › Ir a …). Volvé a la planilla y recargala: aparece el menú **PIE**.
6. **PIE › Configurar clave de acceso**: la clave es **obligatoria** (si no hay, se genera una al azar). La pide la app del celular; **PIE › Ver enlace de la app** muestra la URL y la clave juntas. Los textos que empiezan con `=`, `+` o `@` se guardan siempre como texto (no como fórmula).

7. **PIE › Vincular FOD 02**: pegá el enlace del FOD 02 que está en Google Drive (Hoja de cálculo de Google, o el .xlsx subido a Drive: el script lo convierte solo y lo vuelve a convertir cuando subís una versión nueva). No sirve un enlace de SharePoint. Alternativa: copiar la pestaña del FOD 02 dentro de la planilla del PIE y dejar el enlace vacío (la encuentra aunque se llame "Copia de FOD-02"). El cartel de respuesta dice qué archivo, qué pestaña y cuántos documentos encontró, o por qué no pudo.
8. La primera foto pide permiso de Google Drive (el script crea la carpeta de fotos en tu Drive). Compartí esa carpeta con quien tenga que ver las fotos.

Con eso ya podés usar **PIE › Abrir carga PIE (panel)** desde la compu (botón “Ver fila” lleva al bloque en la planilla).

## 3. Publicar para el celular

En Apps Script: **Implementar › Nueva implementación › Aplicación web**

- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier persona** (la protección es la clave del paso 2.6)

Copiá la URL que termina en `/exec`.

### Opción A — abrir la URL directo (más simple)
Abrís la URL `/exec` en el celular y la agregás a la pantalla de inicio. Si se corta la señal **con la app abierta**, seguís cargando y se envía al volver. Lo que no puede es *abrirse* sin señal (Google no permite service workers en Apps Script).

### Opción B — PWA instalable (abre sin señal desde cero)  ✅ recomendada para obra
1. Publicá la carpeta `app/` en cualquier hosting HTTPS estático (al actualizar, volvé a subir la carpeta entera), por ejemplo:
   - **Netlify Drop** (app.netlify.com/drop): arrastrás la carpeta `app` y te da una URL.
   - **GitHub Pages** en un repo público con la carpeta `app/`.
2. Abrí una vez en el celular: `https://TU-HOSTING/index.html?api=URL_EXEC&token=TU_CLAVE`
   (la app guarda la conexión y borra los parámetros de la barra). Ese enlace podés mandárselo al resto del equipo.
3. iPhone/Safari: compartir › **Agregar a inicio** (abrí siempre la app desde ese ícono: así iOS no borra lo cargado sin señal). Chrome Android: menú ⋮ › **Instalar app**.
4. Con señal, tocá **Enviar y actualizar ahora** en Ajustes: a partir de ahí abre y carga sin conexión.

**Al pasar a la v1.6 en el iPhone**: antes de borrar el ícono, abrí la app con señal y esperá «Al día» (que no quede nada sin enviar). Después borrá el ícono y volvé a hacer **Agregar a inicio**: iOS fija los colores de la barra de estado al instalar. Cuando hay una versión nueva, la app avisa «Hay una versión nueva de la app» con el botón **Recargar**.

Cada vez que publiques una nueva versión del script, usá **Implementar › Administrar implementaciones › editar › Nueva versión** para conservar la misma URL.

## Validaciones de datos de la planilla

Las hojas traen validaciones en modo “rechazar” con listas que quedaron cortas: ESTADO sólo admite `DATOS!$J$15:$J$15` (= sólo “AP”) y RESPONSABLE sólo `DATOS!$D$12:$D$14` (3 nombres, sin “N/A”). En Google Sheets eso hacía fallar la app con *“Los datos que ingresaste en la celda J.. infringen las reglas de validación”* al marcar RZ o elegir otro responsable. Desde la v1.1 el script quita esas validaciones sólo mientras escribe y las restaura iguales. Si querés que también funcionen bien a mano, ampliá los rangos en la planilla (ESTADO → `DATOS!$J$15:$J$16`, RESPONSABLE → `DATOS!$D$12:$D$16`).

Si un alta falla a mitad de camino, el bloque copiado se borra para que el reintento no lo duplique, y el error se muestra en el registro con botón **Reintentar**.

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
python3 test/export_xlsx.py "FOD-02 Rev. 3 Registro de Control y Distribución de Documentos.xlsx" fod.json
python3 test/export_xlsx.py "FOG 01 - FORM. DE MEJORAS.xlsx" fog.json
node test/backend.test.js wb.json fod.json fog.json
# pruebas estáticas: copia para Apps Script, versión del service worker, sin confirm() ni recursos externos
node test/static.test.js
# servidor local que simula la web app + prueba E2E en celular emulado (Playwright)
node test/server.js wb.json 8080 fod.json fog.json &
node test/e2e.test.js capturas/
```
