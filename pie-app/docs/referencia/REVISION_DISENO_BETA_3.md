> **Documento de referencia (histórico).** Se escribió para la 2.3.0-beta.3: revisión de gestos, colores y accesibilidad. El código actual (2.3.1) manda: si algo no coincide, vale lo que está en `pwa/index.html` y `apps-script/`.

# Revisión de diseño y pruebas — beta.3

La revisión comenzó con tres agentes (gestos, colores y diseño) y tres subagentes (pruebas de gestos, pruebas de colores y accesibilidad). Un límite de uso interrumpió sus turnos. Se conservaron los hallazgos y los archivos de pruebas; el agente principal completó la implementación, revisó los cambios y ejecutó la validación. No se presenta esto como una aprobación independiente de los seis agentes.

## Problemas y correcciones aplicadas

| Hallazgo | Cambio | Evidencia |
|---|---|---|
| Panel de detalle competía con la imagen por los 640 px de alto; la regla `.pl-sheet.tall` podía ocupar el 62% y reducir la imagen casi a cero | Imagen con alto estable (mínimo 320 px); detalle debajo en flujo normal | Navegador: altura de la imagen igual antes/después de seleccionar una tarea, en 390 y 1440 px de ancho |
| La rueda del mouse cancelaba siempre el desplazamiento y cambiaba el zoom en saltos de 18% | Rueda normal desplaza; Ctrl/⌘+rueda aplica zoom proporcional; botones +/− siguen disponibles | Pruebas de rueda normal, horizontal y modificada; navegador con scroll, zoom y arrastre |
| Cada pointermove escribía la transformación y la captura podía quedar activa si el gesto se interrumpía | Agrupación por requestAnimationFrame; limpieza al cancelar, perder captura, cambiar ventana o esconder la página | 12 pruebas de gestos sobre las funciones reales con DOM simulado |
| Una sincronización podía reconstruir el visor mientras se arrastraba | Aplazar el redibujado final durante un gesto y su intervalo inmediato de estabilización | Inspección de `finishRender`; la sincronización continúa, solo se posterga el dibujo |
| El color se calculaba exclusivamente por AP/RZ/avance | Cinco colores manuales más “Por estado”, para pines y zonas; columna color compatible con filas anteriores | 10 pruebas de backend y flujo de navegador: cambio antes/después del envío, recarga offline y persistencia |
| El código documental y la hoja seleccionada se perdían entre otros controles | Tarjeta “Documentos del registro” separada y cabecera “Hoja activa”, con título, código y revisión | Capturas de navegador móvil y escritorio; cambio entre hojas |
| Texto completo de cada hoja generaba pestañas muy largas | Pestañas breves por número de hoja; título completo en cabecera y etiqueta accesible | Revisión visual y controles de desbordamiento horizontal |

El estado sigue expresado por el símbolo de la marca, el resumen del control y los filtros de estado. Elegir azul, violeta, naranja, turquesa o rosa no aprueba ni rechaza un control. Los colores manuales no tienen significado contractual predefinido.

## Propuestas para la próxima iteración

| Prioridad | Mejora | Criterio de aceptación |
|---|---|---|
| Alta | Visor ampliable a pantalla completa, con panel lateral en escritorio | Abrir/cerrar sin perder hoja, zoom, selección ni cambios pendientes; la imagen conserva espacio útil en móvil horizontal |
| Alta | Deshacer al mover, colorear o quitar marcas | Restaurar geometría y color correcto antes y después de sincronizar, sin duplicar operaciones |
| Alta | Indicador de descarga por hoja y advertencia antes de salir sin conexión | Distinguir disponible offline, pendiente y error; no anunciar descarga completa si alguna hoja faltó |
| Media | Leyenda de colores definida por la obra y filtro por color | Nombres visibles y editables; estado AP/RZ se mantiene separado; compatibilidad entre dispositivos |
| Media | Lista buscable de marcas y vínculo con el control | Encontrar por elemento, tarea, responsable o color y centrar la marca sin cambiar la hoja incorrecta |
| Media | Completar navegación de teclado y lectores de pantalla | Activación Enter/Espacio de los pines, foco preservado al regenerar paneles y navegación de pestañas con flechas |
| Media | Reducir el alto de las fotos cuando hay muchos adjuntos | Vista compacta con contador y expansión; conservar leyendas y acceso a las fotos históricas |

## Pruebas ejecutadas y límites

- 40 pruebas anteriores de integridad, manifiesto y reglas: aprobadas.
- 12 pruebas de gestos: aprobadas (incluyen pellizco simulado y dimensiones temporales nulas).
- 10 pruebas de colores: aprobadas (paleta válida, filas históricas, migración de encabezado, cambios de color, no alterar geometría/estado y restricciones de planilla).
- Flujo de navegador Chromium en 390×844 y 1440×844: vínculo de tres hojas, pin, zona, AP desde la marca, colores, fotos solo arriba, recarga sin conexión, envío confirmado y revisión incorrecta sin imagen. Sin errores JavaScript ni desbordamiento horizontal de página.
- Regresión de sincronización: 27 operaciones enviadas en lotes de 25+2, caché limitada a cuatro archivos públicos y persistencia offline.

La API de Google se simuló: no se publicaron cambios ni se escribieron datos en la cuenta del usuario. Las capturas usan las imágenes recibidas y registros ficticios. Quedan pendientes la prueba en el dispositivo que se tildaba, Safari/iPhone real, sesiones largas, gran cantidad de marcas y latencias reales de Drive. Las pruebas corrigen y cubren causas concretas; no certifican ausencia de todo bloqueo posible.
