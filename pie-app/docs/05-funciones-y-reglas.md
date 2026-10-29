# 5 · Funciones de la app y reglas de obra

Lo que hace la app desde el punto de vista de quien la usa, y las reglas que el front tiene que respetar.

## Vocabulario

| Término | Significado |
|---|---|
| **PIE / FOP 01** | Plan de Inspección y Ensayo. Hay una hoja por **planilla** (rubro de obra: 6 = estructura, 25 = cubiertas…), agrupadas en **rubros** (`PIE.RUBROS`). |
| **Registro** (bloque) | Una inspección concreta: encabezado (responsables, piso, sector, etapa, elemento) más la tabla de controles. Se identifica por la fila «TAREA». |
| **Control** (ítem) | Una fila de requisito: etapa PRE / DURANTE / POST / DOC, tarea, muestra, criterio, método (IV/ID), instrumento. Se carga documento, fecha, responsable, estado, N° de FUM y observaciones. |
| **AP / RZ / N/A** | Aprobado / Rechazado / No aplica. Si no tiene ninguno, está **pendiente**. |
| **FUM** | Ficha de no conformidad que se abre al marcar RZ. Se registra en el **FOG 01** con número correlativo y se cierra al aprobar la reinspección (o queda **Anulada** si el control pasa a N/A). |
| **FOD 02** | Registro de documentos y planos, con sus revisiones. Sirve para elegir el DOCUMENTO del control y avisar si quedó **superado**. |
| **Liberación de etapa** | Constancia de que una etapa del registro está completa y en regla. Queda en la hoja LIBERACIONES. |
| **Lámina** | Imagen `.webp` de un plano, vinculada a códigos del FOD 02. Sobre ella se ponen **pines** y **zonas**. |

## Pantallas y funciones

1. **Inicio**:
   - Búsqueda global de registros, FUM y planos del FOD 02, con veredicto de revisión.
   - Recientes, rubros con sus planillas y FUM abiertas.
   - Indicador de envíos en el header.
2. **Planilla**:
   - Pestañas Registros / Requisitos y buscador.
   - Registros con barra de avance AP/RZ/N/A/pendiente.
   - Botón «Nuevo registro».
3. **Nuevo registro**: el formulario copia el encabezado del último bloque (o del elegido) y el documento del plano. Al guardar queda en la cola como `create` y se puede seguir cargando enseguida.
4. **Registro**, la pantalla de trabajo:
   - Resumen del encabezado (editable) y plano del registro (FOD 02), con aviso si la revisión está superada y opción de actualizarla en todos los controles.
   - Filtros Todos / Pend. / AP / RZ / N/A y banda de etapa: «Aprobar los N pendientes», «N/A a la tarea», «Siguiente pendiente».
   - Tarjeta por control con AP / RZ / N/A de 56 px y «⋯» para el detalle:
     - documento, fecha, responsable, instrumento con N° de serie, observaciones y fotos;
     - la FUM, si tiene.
   - «Borrar carga» con Deshacer.
   - Fotos del registro: cámara o galería, nota, fecha de la toma y autor.
   - **Visor de láminas** dentro del registro: hojas, zoom, pellizco, pantalla completa, pines y zonas por registro, etapa o tarea, colores, filtro por estado, AP/RZ/N/A desde la marca, borrar con Deshacer y «Bajar las que faltan» para usarlas sin conexión.
   - **Liberar etapa**: checklist con los motivos que bloquean y los avisos.
5. **FUM**: agenda de abiertas con días desde la apertura y plazo, más el historial de cerradas y anuladas.
6. **Ajustes**:
   - Inspector, conexión (solo en modo PWA) y tema claro/oscuro/automático.
   - Envíos pendientes y con error: reintentar o descartar.
   - Espacio usado y planos sin conexión. Instalar la app.

## Reglas al marcar (`decideMark` / `applyMark`)

- **AP / RZ**:
  - Escribe el estado.
  - Completa la fecha de hoy si no tiene una fecha válida, y el responsable (el inspector) si está vacío.
  - Pone el DOCUMENTO del plano del registro (`docDefault`).
  - Si el control pide instrumento con N° de serie, usa la última serie elegida para ese instrumento (`instrMemo`).
  - Si el plano tiene una revisión superada, pregunta (`askPlano`) si se pasa a la vigente: «Pasar a R07 y marcar».
- **AP sobre un control con FUM abierta**: pregunta y, si se confirma, la cierra como reinspección aprobada. El cierre queda retenido 6 s para poder deshacer.
- **RZ**: abre una FUM y deja abierto el detalle para completar la acción correctiva y el plazo. Mientras el detalle está abierto, la FUM no se envía: si el RZ fue un error, no llega nada al FOG 01.
- **N/A**: escribe `NA` en la fecha y deja vacío el estado. Si había una FUM, pregunta y la cierra como **Anulada**, así el FOG 01 no dice «Reinspección aprobada».
- Tocar el estado que ya tiene no hace nada; además, cada control tiene un bloqueo de 700 ms. Para desmarcar se usa «Borrar carga», que ofrece Deshacer.

## Reglas de liberación (bloque `RL`, iguales en el celular y en el servidor)

Bloquean:
- controles pendientes;
- controles en RZ;
- FUM abiertas;
- AP sin fecha válida (o con fecha futura) o sin responsable;
- instrumento con «INDIQUE» (sin N° de serie);
- equipo que no está en EQUIPOS DE MEDICIÓN, que figura para dos equipos distintos, que no tiene vencimiento o que estaba vencido el día del control (si la serie se repite, vale el vencimiento más lejano);
- documento con revisión superada, no vigente o no aprobado en el FOD 02;
- plano del registro superado (este solo lo controla el celular).

Solo avisan (quedan anotados en LIBERACIONES › Observaciones):
- documento que no está en el FOD 02;
- documento sin revisión o con una revisión más nueva que la del FOD 02;
- código ambiguo;
- FUM indicada que no está en el índice;
- FOD 02 que no se pudo consultar.

Otras reglas:
- La fecha de liberación es el día en que se decidió: no puede ser futura ni anterior a los controles.
- Una etapa liberada no se duplica.

## Documento y revisión

- En el FOD 02, «-», «S/N» o vacío significa «sin revisión».
- Primero se busca el código exacto, respetando `_` y `.`. Si no aparece, se busca normalizado.
- Un código que ya termina en `-R##` se acepta como código con revisión.
- `-R07`, `_07` y `-REV-7` son la misma revisión.
- Una lámina se abre solo si el código **y** la revisión del DOCUMENTO del registro coinciden con los de la lámina. Por ejemplo, «P06_02 // 07» no abre la lámina R07.

## Equipos de medición

- La hoja EQUIPOS DE MEDICIÓN tiene las columnas EQUIPO, N° DE SERIE, CALIBRACIÓN VENCE, CERTIFICADO y OBSERVACIONES.
- La app avisa los equipos vencidos y los que están por vencer, y sugiere las series según el instrumento del control (`DATOS`).
