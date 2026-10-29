> **Documento de referencia (histórico).** Se escribió para la 2.3.0-beta.1: propuesta y alcance. El código actual (2.3.1) manda: si algo no coincide, vale lo que está en `pwa/index.html` y `apps-script/`.

# PIE: propuesta y versión de trabajo para la beta

La base actual ya resuelve carga de controles, cola local, fotos, FUM, liberaciones y marcas sobre láminas. El alcance confirmado es **equipo interno: inspecciones y planos**. Recomiendo mantener Apps Script + Sheets para ese piloto acotado y validar en obra la trazabilidad y la sincronización. La certificación económica queda como propuesta posterior.

Se preparó `2.3.0-beta.1` como copia independiente de los adjuntos. No está desplegada ni conectada a la planilla real. La propuesta DOCX se tomó como referencia de producto; sus requisitos no se consideran funcionalidades ya implementadas ni instrucciones para publicar.

## 1. Qué mejoré en el código entregado

| Cambio | Problema que corrige | Alcance |
|---|---|---|
| Validación de liberaciones en servidor | `opLiberar_` confiaba en que la pantalla hubiera comprobado las condiciones | Relee controles guardados dentro del lock del lote; bloquea pendientes, RZ, etapas inexistentes, FUM abiertas o no verificables y falta de responsable |
| Documentación y equipos al liberar | Una petición directa podía omitir los chequeos de pantalla | Comprueba documentos indicados contra FOD 02, coincidencia de revisión, vigencia, rechazo explícito y alias ambiguos; serie identificable y calibración a la fecha del control |
| Fecha y resumen de liberación | Fecha y cantidades de AP/N/A provenían del dispositivo | Fecha del servidor y resumen derivado de los controles persistidos; las fechas de inspección permanecen en sus controles |
| Integridad de zonas | Bastaba con recibir tres coordenadas dentro de rango | Rechaza vértices repetidos, cruces, bordes superpuestos y zonas degeneradas; conserva polígonos cóncavos válidos |
| Integridad de pines | Mover podía actuar sobre un pin retirado o de otra planilla | Comprueba planilla y estado activo; exige vértices para mover una zona; al crear comprueba la asociación entre lámina y planilla |
| Envíos acotados | Toda la cola de cambios viajaba en una petición | Lotes de hasta 25 operaciones, continuación de pendientes y validación del formato antes de tomar el lock |
| Espera de respuesta | Se cancelaba el temporizador antes de terminar de leer el cuerpo HTTP | El límite de espera cubre también la descarga del JSON |
| Mensajes y N/A | Algunos errores perdían su explicación; `N/A` explícito no se reconocía como `NA` | Conserva el detalle de errores de validación y reconoce ambas formas |
| Archivos de PWA | El HTML referenciaba archivos que no estaban entre los adjuntos | Agrega service worker, manifiesto e iconos; precachea el shell y evita cachear API, fotos y parámetros de acceso |
| Nuevas claves y escrituras GET | La generación usaba `Math.random`; `GET?action=batch` llegaba al despachador | Nuevas claves con UUID de Utilities; escrituras solo por POST. Las claves existentes no cambian automáticamente |

Los originales y `obra-utils` se conservaron. No agregué dependencias de producción ni cambié las columnas de las planillas. `Beta.gs` es un archivo adicional obligatorio para esta copia de la app.

### Cambios de comportamiento que hay que revisar en la copia de la planilla

- Un AP necesita fecha válida, sin adelantar, y responsable para liberar la etapa.
- Si el instrumento tiene un identificador entre paréntesis, debe corresponder a una única serie en EQUIPOS DE MEDICIÓN y tener vencimiento válido. Revisar el formato real de la lista antes del piloto: las etiquetas entre paréntesis que no sean series necesitan un modelo explícito.
- Un documento indicado debe poder verificarse en FOD 02 y coincidir con su revisión vigente. Esto puede bloquear liberaciones que la versión anterior permitía. Cambiar la revisión de una inspección histórica debe requerir reevaluación técnica, no una sustitución automática para pasar el chequeo.
- El FOD real contiene códigos que solo difieren por un guion bajo. La beta impide liberar cuando esa normalización vuelve ambiguo el documento; debe resolverse la identidad antes de continuar. No se fusionan documentos automáticamente.
- No inventé una exigencia universal de documento, fotografía o motivo de N/A: depende del PET y del PIE aprobado. Por ahora una etapa íntegramente N/A puede registrarse como liberada; no habilita por sí sola cantidades ni pagos.
- No se reevalúan ni migran las liberaciones históricas. Una entrada de LIBERACIONES registra un hecho; no demuestra por sí sola que el registro siga conforme después de nuevas ediciones.
- La normalización de referencias del FOD necesita validarse con ejemplos reales. La prueba usa el formato `1281-C-PL-1202-R02`; no acredita todos los formatos de texto que puedan existir en la planilla.

## 2. Decisiones recomendadas para la beta

### Beta de campo: inspeccionar, ubicar y sincronizar

Trabajar inicialmente con una obra, un equipo interno pequeño y un responsable por registro mientras se implementa control de concurrencia. Recorrer un caso real completo: abrir lámina → elegir elemento → inspeccionar → adjuntar evidencia → registrar rechazo/FUM → reinspeccionar → liberar.

Conservar las capas PRE / DURANTE / POST / DOC, la captura sobre plano y el acceso a criterios de inspección. En la interfaz priorizar:

1. Mostrar siempre elemento, piso, sector y revisión de la lámina.
2. Distinguir «guardado en este dispositivo», «pendiente de envío», «confirmado por servidor» y «requiere revisión».
3. Antes de salir a obra, mostrar cuántas láminas y datos están realmente disponibles offline; una instalación de PWA no implica que los planos hayan sido descargados.
4. Permitir buscar por código de elemento —por ejemplo V1215 o V1216— además de navegar visualmente.
5. Para zonas: confirmar el contorno antes de vincularlo, deshacer vértice y advertir geometría inválida también offline. La validación agregada ahora ocurre en el servidor al sincronizar.
6. Ofrecer respaldo recuperable de pendientes y fotos con controles de acceso; no incluir claves. El paquete actual no agrega esa exportación ni importación.

### Requisitos antes de una beta con varios editores

| Prioridad | Propuesta | Criterio de aceptación |
|---|---|---|
| P0 | Identidad individual y roles: inspector, jefe, calidad y consulta | El servidor identifica al usuario y verifica sus permisos por operación y obra; cambiar `by` no permite suplantar a otro |
| P0 | Conflictos de edición explícitos | Dos dispositivos cambian el mismo control offline; el segundo envío no pisa silenciosamente el primero y ofrece conciliación |
| P0 | UUID estable para registro y control | Insertar/mover filas en Sheets no cambia qué registro controlan pines, fotos, FUM y liberaciones |
| P0 | Recuperación después de fallos parciales | Cortar el proceso después de crear el bloque o la foto y antes del log no produce un duplicado al reintentar |
| P0 | Plano y PIE versionados | Cada inspección conserva su versión de PIE y revisión/archivo de plano; una nueva imagen no reposiciona marcas históricas automáticamente |
| P1 | Evidencia de conformidad y RNC | Motivo para N/A, evidencia requerida por criterio, apertura, acción correctiva, reinspección y cierre con permisos definidos |
| P1 | Invalidación de liberación | Cambiar un control ya liberado genera una nueva revisión y obliga a reevaluar la liberación; no se borra el historial |
| P1 | Auditoría | Registro de antes/después, usuario verificado, hora servidor, dispositivo y correlación con operación; texto libre y una hoja editable no equivalen a auditoría inalterable |
| P1 | Observabilidad | Ver pendientes, errores permanentes y reintentos; métricas de tiempo de envío, cuota de almacenamiento y fallos del backend |

La clave compartida actual sigue siendo la autenticación de la app. El manifiesto original ejecuta como el publicador y admite acceso anónimo; no lo cambié porque modificarlo altera el flujo de conexión de la PWA. Tampoco agregué roles ficticios basados en el nombre que selecciona el usuario. No habilitaría acceso de subcontratistas ni decisiones de pago con este esquema.

`_PIE_LOG` evita repetir operaciones cuyo resultado quedó registrado, pero Sheets y Drive no participan de una transacción conjunta: una interrupción entre el efecto y el log sigue siendo un riesgo. El lock serializa envíos; no detecta que un dispositivo trabaja con una versión vieja de un campo.

## 3. Aplicación a los planos adjuntos

Las coordenadas actuales son relativas a imágenes WebP. Esto sirve para ubicar marcas, pero todavía no es un visor DWG/PDF vectorial ni una medición física calibrada.

En los detalles de refuerzo y banquinas aparecen dibujos con diferentes escalas dentro de una misma lámina, aunque el cajetín indique una escala general. Para medir, la calibración debe pertenecer a una vista o región del plano y a una revisión específica. Debe usar una cota conocida y verificarse con otra medida independiente. No convertir píxeles en metros usando solo el ancho de la imagen o la escala del cajetín.

La fórmula de área, una vez calibrada una vista sin deformación, es `área_en_píxeles × (metros_por_píxel)²`. Las coordenadas normalizadas deben convertirse usando ancho y alto reales; no usar una sola dimensión para ambos ejes. Una foto deformada o una lámina con vistas a distintas escalas necesita calibraciones independientes. Antes de habilitar cómputo, definir una tolerancia de error y aprobación de esa calibración.

Casos de prueba sugeridos, basados en la lectura visual de las imágenes y sujetos a confirmación técnica:

| Elemento | Qué registrar | Qué evitar |
|---|---|---|
| V1215 y V1216 | Identidades distintas, plano de ubicación, detalle, revisión y controles por etapa | Fusionarlas por compartir un procedimiento de refuerzo |
| Banquina tipo 1 | Nueve instancias físicas, cada una con ID y estado propios; asociadas a un detalle común | Certificar las nueve porque se aprobó un solo pin sobre el detalle |
| Banquina tipo 2 | Una instancia, diferenciada del tipo 1 | Reutilizar cantidades o geometría del otro tipo |
| Acero de banquinas y vigas | Unidad contractual y fuente del cómputo; la tabla muestra totales con +10% | Sumar otra vez el desperdicio o tratar peso teórico como cantidad certificable automática |
| Plantas y detalles | Vincular ubicación con detalle y conservar ambos documentos | Considerar que un polígono sobre un detalle representa un sector físico completo de la planta |

El tipo 1 presenta un total de acero indicado de 681,9 kg para el conjunto y un valor unitario redondeado de 75,8 kg. Multiplicar el unitario redondeado por nueve no reproduce exactamente el total. La beta debe conservar fuente, precisión y criterio contractual de redondeo. Estos valores sirven como casos para comprobar datos, no como aprobación del cómputo ni del diseño estructural.

El manifiesto distingue las dos páginas de banquinas mediante `1281-C-PL-1881` y `1281-C-PL-1881-p10`. Recomiendo separar código documental, revisión e identidad de página. La herramienta actual puede reemplazar una imagen por ID al importar; conservar revisiones antiguas antes de usar planos para trazabilidad contractual.

## 4. Certificación: siguiente incremento de la beta

Propondría una **pre-certificación revisable**, con aprobación humana y sin instrucción automática de pago. Mantener separados:

- Calidad: pendientes, conforme, observado, RNC activa y reinspección conforme.
- Medición: cantidad ejecutada, cantidad medida, unidad, método, evidencia y aprobación de medición.
- Economía: contrato, ítem, precio/versionado, acumulado anterior, cantidad del período, retenciones y aprobación del certificado.

Un pin puede indicar una inspección. Varios pines pueden representar el mismo trabajo. La unidad certificable debe tener ID propio —por ejemplo contrato/ítem/elemento/porción de medición— independiente de las marcas gráficas.

Regla propuesta: una cantidad entra en el borrador del período si su medición está aprobada, todos sus controles exigibles están conformes y vigentes, no tiene RNC activa y no fue certificada antes. Observaciones, reaperturas y cambios de revisión requieren reglas acordadas. Una etapa PRE verde no significa que el elemento esté ejecutado o listo para certificar.

Ejemplo: contrato de nueve banquinas tipo 1 por unidad. Si se ejecutaron y midieron cuatro, tres cumplen todos los controles y una tiene RNC activa, el borrador muestra tres elegibles y una bloqueada. Las otras cinco no se certifican. Precio, descuentos y condiciones quedan definidos por contrato. Es un ejemplo funcional, no una regla contractual asumida.

En el modelo mínimo agregaría entidades de Obra, Usuario/Rol, PIE/Versión, Elemento, Inspección, Evidencia, Plano/Revisión/Vista, Marca, RNC, Contrato/Ítem, Medición y Certificado/Detalle. Mantener referencias estables y eventos históricos, no derivar toda la información de números de fila.

La exportación puede seguir las tres pestañas de la propuesta: Certificación Mensual, Detalle de Inspecciones y Diccionario/Reglas. Un `.xlsx` no contiene macros VBA; si realmente se necesitan macros, debe definirse un `.xlsm` y su mantenimiento. Para la beta conviene un `.xlsx` con importes y fórmulas transparentes. No se implementó exportación económica en este paquete porque faltan el contrato y las reglas de medición/pago.

## 5. Arquitectura y evolución

Para el piloto interno, conservar la implementación actual reduce la migración y permite contrastar contra FOP-01/FOD-02/FOG-01 reales. Congelar la estructura de filas durante ese piloto y mantener un responsable por registro reduce riesgos, pero no reemplaza los controles de concurrencia.

Con varios contratistas, varias obras o certificación, evaluar una API con identidad individual, base transaccional y almacenamiento privado de evidencias. Sheets puede seguir como salida o herramienta administrativa. Separar progresivamente interfaz, repositorio local, sincronización, reglas de calidad y reglas económicas; el HTML monolítico actual vuelve más difíciles las pruebas y los cambios.

No prometer sincronización en segundo plano con la app cerrada en iPhone. La beta debe garantizar y probar la recuperación de pendientes al abrir o retomar la app. El almacenamiento persistente solicitado al navegador puede ser denegado o eliminado; no equivale a una copia de seguridad.

## 6. Validación realizada y alcance

- Pruebas Node sobre funciones de Apps Script cargadas en VM con servicios simulados: liberaciones, fechas, FUM, FOD, equipos, geometría, coordenadas, lotes y bloqueo de escrituras por GET.
- Validación de sintaxis JavaScript/JSON y consistencia entre ambos HTML.
- Chromium con ancho móvil, servidor local y API simulada: instalación del shell, apertura offline, AP persistido al recargar, reconexión y confirmación; división de 27 operaciones en lotes de 25 y 2; caché limitada a cuatro archivos públicos del shell.

Estas pruebas no validan OAuth, permisos/cuotas de Apps Script y Drive, escritura en las planillas reales, fotografías reales ni comportamiento de Safari/iPhone. Se recibieron después los dos PDF fuente: se generaron siete láminas WebP para la app y una copia WebP de sus 29 páginas. Se conservaron las revisiones del cajetín; la equivalencia con el FOD sigue pendiente. La app no fue desplegada.

Después se recibieron y analizaron los cuatro libros XLSX. Los lectores reconocieron 47 categorías, 266 bloques y 4.866 controles del PIE, 709 códigos del FOD y el encabezado del FOG real. Se inspeccionaron las fórmulas del certificado N°13. Eso valida lectura de estructura a partir de los valores exportados; no valida la conversión a Sheets ni la escritura real. Ver `LECTURA_PLANILLAS.md` para los hallazgos y ubicaciones concretas.

Ver `LEEME_BETA.md` para instalación en copia de prueba, comandos de verificación y reversión.

## 7. Datos que faltan para cerrar el alcance

1. Dentro del equipo interno ya confirmado: dominios de Google Workspace y permisos por rol. Los subcontratistas quedan fuera del alcance de esta beta.
2. PIE-CORE, FOD-02 y FOG-01 ya fueron recibidos y analizados. Falta comprobar lectura/escritura y vínculos sobre copias convertidas a Google Sheets; en EQUIPOS DE MEDICIÓN faltan las fechas de vencimiento de los cuatro equipos.
3. PET y PIE aprobados: tamaño de muestra, evidencias obligatorias, motivos de N/A y reglas de liberación.
4. Para la fase posterior de certificación ya se recibió el certificado N°13 base. Resta confirmar sus reglas como contrato aplicable, resolver dependencias externas y acordar el vínculo de inspecciones con mediciones/partidas; no hace falta volver a enviar ese certificado.
5. Los dos PDF originales ya se recibieron y las siete láminas WebP están incluidas. Falta acordar el criterio de vigencia, actualización de revisiones y respaldo histórico antes del uso real.
6. Cantidad de dispositivos/usuarios simultáneos, modelo de iPhone/tablet y duración esperada sin conexión.

No hacen falta credenciales en el chat. Las pruebas sobre Google se deben hacer con una copia de datos y accesos configurados por el responsable de la obra.
