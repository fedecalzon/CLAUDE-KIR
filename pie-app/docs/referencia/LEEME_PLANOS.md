> **Documento de referencia (histórico).** Se escribió para la 2.3.0-beta: formato de planos.json y carga de láminas. El código actual (2.3.1) manda: si algo no coincide, vale lo que está en `pwa/index.html` y `apps-script/`.

# WebP de los dos PDF recibidos

Se convierten todas las páginas sin recortar la lámina, conservando proporciones y orientación visible del PDF. Las imágenes tienen 3.700 píxeles de ancho y calidad WebP 90. Los PDF originales no se modifican.

## Archivos para la aplicación

La carpeta `Planos` contiene siete imágenes y `planos.json`:

| PDF | Página del PDF | Lámina | Archivo WebP |
|---|---:|---|---|
| COMR-MC-REF-ESTRUCTURA S11P_RevB.pdf | 7 | Planta estructura sobre piso 11 | 1281-C-PL-1202.webp |
| COMR-MC-REF-ESTRUCTURA S11P_RevB.pdf | 8 | Refuerzo de viga V1216 | 1281-C-PL-1232.webp |
| COMR-MC-REF-ESTRUCTURA S11P_RevB.pdf | 9 | Refuerzo de viga V1215 | 1281-C-PL-1233.webp |
| 1281-C-CA-020_RevA.pdf | 8 | Planta de subpresión | 1281-C-PL-1802.webp |
| 1281-C-CA-020_RevA.pdf | 9 | Banquina tipo 1 | 1281-C-PL-1881.webp |
| 1281-C-CA-020_RevA.pdf | 10 | Banquina tipo 2 | 1281-C-PL-1881-p10.webp |
| 1281-C-CA-020_RevA.pdf | 11 | Sistema de bombeo: sala de bombas, planta, cortes y detalles | C1224-01-PL-SDB003.webp |

Las dos banquinas repiten el código del cajetín. Se conserva el sufijo `-p10` para que sean imágenes independientes y compatibles con el manifiesto anterior. No se inventa un nuevo código documental: el campo `codigo` conserva el código impreso.

La sala de bombas tiene rotación interna de PDF de 270°; el WebP conserva su presentación horizontal y legible. Se agrega como referencia en la planilla 6 para mantener el agrupamiento existente de estas láminas.

## Cómo cargarlos

1. En la planilla de prueba, abrir **PIE → Planos: abrir carpeta y verificar**.
2. Subir **los siete `.webp` y `planos.json` directamente dentro de esa carpeta de Drive**. No crear otra subcarpeta Planos dentro de la carpeta existente.
3. Si ya hay archivos con esos nombres, actualizar sus versiones o reemplazarlos de forma controlada; evitar dejar duplicados con el mismo nombre. Conservar una copia de los archivos anteriores si contienen otra revisión.
4. En la app, con señal, elegir **Sincronizar y descargar todo**.
5. Comprobar que aparecen las siete láminas y abrirlas. Después probar en modo avión.

El campo `v` cambia según el contenido de cada imagen para que la app descargue su nueva copia. Los seis IDs anteriores se mantienen. Las coordenadas siguen normalizadas sobre la página completa: no se recortaron cajetines ni márgenes.

## Documentos completos

`Documentos_completos/S11P` contiene las 15 páginas del primer PDF y `Documentos_completos/Subpresion` las 14 del segundo, una imagen por página. `indice-paginas.json` registra origen, página, tamaño y hash de cada archivo.

Las 22 páginas restantes son memoria, tablas o esquemas dentro de la memoria; se conservan en esa carpeta, fuera del listado operativo de planos. No hay que subirlas todas a la carpeta de Drive para usar el visor de las siete láminas.

Los cajetines de S11P identifican las hojas 02, 05 y 06 de una serie de 07; estos PDF incluyen esas tres. El documento de subpresión incluye las hojas 02, 03 y 04 de su serie de 04, más el plano de bombeo. No se reconstruyeron hojas que no están en los PDF recibidos.

## Revisiones

Se conserva la revisión impresa en el recuadro REVISION: R02 para las tres láminas S11P, R00 para subpresión/banquinas y C para bombeo (`RC` en el manifiesto). En S11P, el nombre de archivo de dibujo impreso contiene R04 y la tabla de modificaciones tiene numeración propia: se registra aparte como `revision_archivo`.

No se cambia R02 por R05 basándose solo en el FOD. La equivalencia entre revisión de lámina, revisión del archivo de dibujo, revisión de la memoria y registro documental debe confirmarla el responsable de documentación antes de usarla para liberar controles.

## Vínculo desde el registro (beta.2)

El manifiesto incluye `documentos`: códigos completos con revisión que vinculan cada hoja con el encabezado del registro. Ver `ACTUALIZAR_BETA_2.md` en la raíz del paquete. Actualizá también Code.gs e Index.html para recibir y usar estos vínculos.
