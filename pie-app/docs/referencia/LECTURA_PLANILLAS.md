> **Documento de referencia (histórico).** Se escribió para la 2.3.0-beta: cómo lee Apps Script los bloques de las planillas reales. El código actual (2.3.1) manda: si algo no coincide, vale lo que está en `pwa/index.html` y `apps-script/`.

# Contraste con los cuatro XLSX recibidos

Se leyeron los originales sin guardarlos ni modificar sus fórmulas. Los lectores de Apps Script se ejecutaron localmente sobre valores exportados de los libros. Esto comprueba reconocimiento de estructura; no comprueba la conversión de Excel a Google Sheets ni la autorización de Drive.

## PIE - CORE

El lector reconoció **47 categorías, 266 bloques de registro y 4.866 criterios/controles**. El recuento incluye hojas ocultas y bloques que pueden ser modelos: no significa que existan 4.866 inspecciones ejecutadas ni que todos los bloques sean trabajos independientes.

La planilla `6` tiene **16 bloques y 731 controles**, con etapas PRE, DURANTE y POST. La primera tabla está en la fila 12; las columnas relevantes son A: etapa, B: tarea, C: muestra, D: criterio, E: método, F: instrumento, G: documento, H: fecha, I: responsable, J: estado, K: FUM y L: observaciones. Hay controles AP, pendientes y NA; se conserva el significado de esas formas históricas.

EQUIPOS DE MEDICIÓN contiene cuatro equipos y **ninguno tiene fecha de vencimiento de calibración cargada**. La beta revisada permite registrar inspecciones, pero bloquea liberar un AP que cite una serie cuya calibración no se pueda verificar. Completar esas fechas y sus certificados con el responsable; no se inventaron valores ni se completaron automáticamente.

Los instrumentos con paréntesis encontrados usan el formato de serie que esperaba el código, por ejemplo `NIVEL LASER (1167)/CINTA METRICA` y `TELURIMETRO (TELU 117)`, además de modelos con `INDIQUE NO. SERIAL`. No se encontraron en este relevamiento etiquetas de dimensiones entre paréntesis usadas como instrumentos.

La copia trae LIBERACIONES con encabezado y una entrada, y _PIE_LOG con encabezado y 37 entradas. No aparecen _PIE_PINES ni _PIE_FUM en ese XLSX: la ausencia no prueba que no existan en una versión posterior de la app. Los datos históricos de fotos, log y liberaciones no se migraron.

## FOD-02 Rev. 3

El lector reconoce el encabezado de la fila 9 y produce **709 códigos documentales**, eligiendo la última revisión de cada código según la identidad exacta que usa la implementación actual. No son 709 archivos físicos verificados.

En el caso VyL-S11P hay dos identidades textuales:

| Celda / fila de FOD-02 | Código | Revisión | Estado / vigencia |
|---|---|---|---|
| I1042:J1042 | `KIR-COMR-REF-VyL-S11P` | 4 | Aprobado / Si |
| I1084:J1084 | `_KIR-COMR-REF-VyL-S11P` | 5 | Aprobado / si |

La diferencia del guion bajo hace que el lector general mantenga ambos códigos. Una búsqueda que normaliza signos puede confundirlos. La validación de liberación nueva detecta esa ambigüedad y pide revisar el alias; no los fusiona ni modifica los documentos.

El manifiesto de planos adjunto sigue indicando R02 para las láminas de estructura S11P. El FOD contiene R05 para el documento de la familia VyL-S11P. Debe confirmarse si cada lámina pertenece al mismo documento/revisión antes de actualizar imágenes o trasladar marcas. No se declara automáticamente inválido un plano solo por comparar códigos de lámina y de archivo que pueden ser diferentes.

Además, hay 643 códigos cuya última revisión no tiene estado de aprobación cargado. Esto no los convierte automáticamente en rechazados, pero tampoco permite afirmar aprobación por defecto. La política de liberación debe distinguir «última revisión», «vigente» y «aprobado». La beta bloquea `No aprobado` explícito, `No` en vigencia, revisión no coincidente y alias ambiguos; todavía no exige aprobación explícita en todos los documentos.

## FOG 01

El lector detecta el bloque de encabezados de las filas 11 a 13. Las columnas principales coinciden con el código: A número, J fecha, K descripción, L quien registra, M acción inmediata, N descripción de acción, O plazo, P responsable, Q cierre de acción inmediata y R su fecha.

El mismo formulario tiene además AA cierre de acción de mejora, AB fecha, AE verificación de eficacia y AG **Cerrada**. El código actual se apoya en Q/R para reflejar el cierre de la FUM de inspección; no administra íntegramente esos campos de mejora sistémica. No se debe presentar el cierre de una reparación como cierre total de la mejora sin acordar esa regla.

También hay más de una fila con el número 1. Puede ser historial o reapertura: no se renumeró nada. Propongo UUID interno y vínculo a fila/evento concreto para evitar confundir distintos episodios con el mismo número visible. No vincular retrospectivamente todas las FUM existentes a un control solo por coincidencia de número.

La hoja conserva formato/contenido hasta la fila 7.287, aunque las entradas visibles principales y la leyenda están arriba. El reconocimiento encontró la leyenda ORIGEN en la fila 29. Esto refuerza la necesidad de leer rangos acotados y detectar registros reales, sin tratar la extensión del formato como cantidad de incidentes.

## Certificado N°13 - OCT-26

Se inspeccionaron en detalle `CERTIFICADO N°13 - OCT-26´`, `Resumen CERTIFICADO N°13` y `Planilla Medicion`, conservando las hojas históricas.

La hoja del certificado usa A:F para ítem/descripción/cantidad/unidad/precio/importe contractual; J:L para cantidades anterior/presente/acumulada; M:O para porcentajes; P:R para importes anterior/presente/acumulado. Se identificaron 405 filas con código de ítem de al menos tres niveles, unidad y precio numérico; es un criterio de extracción para análisis, no una clasificación contractual definitiva.

El cálculo no se reduce a cantidad nueva por precio. Ejemplo de la fila 9: el importe del presente Q9 se obtiene como R9 − P9; R9 aplica redondeos a la proporción acumulada. La actualización debe conservar esa secuencia y su precisión, en especial si el acumulado anterior fue guardado como valor.

`Resumen CERTIFICADO N°13` incluye:

- F28: deducción del 15% por anticipo financiero.
- F29: fondo de reparo del 5%.
- R23:R26: índices CAC y coeficiente de actualización.
- F31:F37: importe base, mayores costos y diferencia con certificado previo.
- F39: total con IVA del 21%.

Son reglas presentes en el archivo recibido. No se generalizan a otros contratos ni se automatizan sin revisión.

Hay **41 fórmulas con referencia externa** en el rango inspeccionado del certificado actual, y **20** en el resumen actual. Ejemplos: `CERTIFICADO N°13 - OCT-26´!N31` y `Resumen CERTIFICADO N°13!C10/F10` contienen referencias `[4]...` a otro libro. No se cambiaron: pueden ser intencionales. Antes de automatizar exportación debe decidirse si dependen de un archivo que se conserva o si deben migrarse a referencias internas con conciliación de resultados.

La dimensión declarada de varias hojas llega hasta la columna 16.365, aunque el certificado operativo usa principalmente A:R. Una importación debe acotar columnas y omitir celdas solo formateadas; no leer ciegamente toda esa dimensión como datos.

Planilla Medicion ya contiene descomposición de globales por incidencias. La vinculación futura debe ser inspección/elemento → medición autorizada → subítem e incidencia → partida de certificado. No vincular una aprobación de calidad directamente a todos los porcentajes de un rubro.

## Propuesta concreta después de esta lectura

1. Para el piloto: completar/verificar calibraciones; resolver alias documental S11P; confirmar las imágenes vigentes; ensayar offline con la planilla de prueba.
2. Acordar y reflejar en la interfaz qué cierra el inspector y qué cierra Calidad en FOG. Mantener por separado reinspección conforme, acción inmediata cerrada y mejora cerrada.
3. Agregar ID estable a registros/controles y protección contra cambios concurrentes antes de ampliar el uso interno.
4. Para una fase económica posterior: conservar el certificado base, crear un mapa explícito de partidas/mediciones y conciliar importes sobre una copia antes de proponer cualquier escritura.

Los datos que faltan ya no incluyen los cuatro libros recibidos. Los dos PDF fuente también se recibieron después y las siete láminas WebP están preparadas. Quedan las fechas/certificados de calibración y decisiones de negocio sobre vigencia documental, N/A, muestra y cierre de FOG.
