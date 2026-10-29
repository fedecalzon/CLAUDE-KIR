# 2 · API y estructuras de datos

Todas las llamadas pasan por `callApi(req)` en el front y por `handle_(req)` en `Code.gs`. A cada `req` se le agrega `token`.

Respuesta en caso de error: `{ok:false, error, code}`. Los valores de `code` son:
- `auth`: clave incorrecta;
- `config`: falta la clave o el enlace;
- `bad_request`;
- `busy`: lock ocupado;
- `conflict`: no se encontró el bloque;
- `not_found`;
- `retry`;
- `error`.

El front traduce estos errores a «palabras de obra» en `ERR`, `apiFail` y `opErrText`.

## Acciones

| `action` | Pedido | Respuesta |
|---|---|---|
| `ping` | — | `{ok, version}` |
| `catalog` | — | Catálogo completo (ver abajo) |
| `sheet` | `{sheet}` | `{ok, categoria}` (una planilla) |
| `plano` | `{id}` | `{ok, id, mime:'image/webp', data:<base64>}` |
| `batch` | `{ops:[…]}` (POST; si llega por GET da error) | `{ok, results:[{id, ok, dup?, sheet, h, url?, fum?, warnings?, error?, code?}], categorias:[planillas tocadas], fums, liberaciones, pines}` |

En `batch` el servidor procesa como máximo 25 operaciones por pedido. El resto vuelve con `code:'retry'`.

## Catálogo (`action:'catalog'`)

```js
{
  ok, version, generado,               // ISO
  datos: { obra, direccion, licitacion, responsables:[{nombre, abrev}], instrumentos:[…], metodos:['IV','ID'], estados:['AP','RZ'] },
  fod:   { docs: [doc…], aviso? },     // FOD 02, una fila por código (última revisión + historial)
  fums:  [fum…],
  equipos: [{equipo, serie, vence:'aaaa-mm-dd', venceTxt, cert, obs}],
  liberaciones: [[planilla, filaTarea, etapa, fecha, liberó, controles]],
  pines: [pin…],
  planos: [{id, planilla, titulo, sub, rev, w, h, v, codigo, documentos[]}],   // una entrada por planilla
  fogAviso: '',                        // texto si el FOG 01 está vinculado pero no abre
  categorias: [categoria…]
}
```

### `categoria` (una hoja de planilla)

```js
{
  sheet: '25', titulo: 'PLANILLA 25 - …', rubro: 'Cubiertas', oculta: false,
  crit: [[etapa, tarea, muestra, criterio, metodo, instrumento], …],   // diccionario de requisitos
  registros: [{
    h,            // fila «TAREA» del bloque = identidad del registro
    s,            // primera fila del bloque
    sig,          // firma del bloque (para encontrarlo si se movieron filas)
    slots,        // cantidad de celdas de responsables
    resp: [...], piso, sector, etapa, elemento,
    cols: ['documento','fecha',…],     // columnas que existen en el bloque
    fotos: { <off>: [[archivoId, enlace, fecha, inspector, nota], …] },   // off 0 = foto general del registro
    items: [[off, critIdx, documento, fecha, resp, estado, fum, obs], …]
  }]
}
```

`expandItem(cat, raw)` arma el control completo: `{off, etapa, tarea, muestra, criterio, metodo, instrumento, documento, fecha, resp, estado, fum, obs}`. Aclaraciones:
- `off` es el desplazamiento de la fila dentro del bloque.
- `estado` es `'AP'`, `'RZ'` o `'N/A'`/`'NA'`, o queda vacío si el control está pendiente.
- N/A también puede figurar en la columna fecha.

### Tuplas compactas

Las tuplas van como arrays por tamaño. Cuando haga falta, leer el índice en la función que las arma:

| Tupla | Arma | Campos (índice) |
|---|---|---|
| `doc` del FOD 02 | `parseFod_` | 0 código, 1 rev, 2 detalle, 3 categoría, 4 piso, … 6 estado de aprobación, 7 vigente (SI/NO), … último: historial `[[rev, …]]` |
| `fum` | `readFums_` | 0 N°, 1 planilla, 2 filaTarea, 3 off, 4 fecha apertura, 5 estado (Abierta/Cerrada/Anulada), 6 reinspección prevista, 7 acción correctiva, 8 elemento, 9 criterio, 10 observación, 11 fecha cierre, 12 resultado, 13 detectado por, 14 piso, 15 acción inmediata |
| `pin` | `readPines_` | 0 id, 1 planilla, 2 filaTarea, 3 plano, 4 x, 5 y, 6 elemento, 7 piso, 8 autor, 9 alcance k (`reg`/`etapa`/`tarea`), 10 alcance v, 11 pts de zona, 12 color (`auto` o nombre) |

## Operaciones del lote (`op`)

Campos comunes:
- `id` (uid, idempotencia), `op`, `sheet`, `by` (inspector).
- Destino: `h` + `sig` + `elemento` para un registro existente, **o** `ref` = id del `create` pendiente.
- Solo en el celular, `stripOp` los saca antes de enviar: `status`, `sent`, `createdAt`, `error`, `snapshot`, `slots`, `docDefault`, `img`.

| `op` | Campos | Efecto en la planilla |
|---|---|---|
| `create` | `base:{h,sig}` (bloque modelo), `header:{responsables[], piso, sector, etapa, elemento}`, `items:{off:{campo:valor}}` | Copia el bloque modelo (formato, combinaciones, validaciones) debajo del último bloque, completa el encabezado y los controles. Devuelve `h`. |
| `update` | `items:{off:{documento?, fecha?, resp?, estado?, fum?, obs?, instrumento?}}`, `header?` | Escribe las celdas. Cada `items[off]` lleva `criterio`/`tarea` para encontrar la fila aunque se haya corrido. |
| `photo` | `scope:'registro'`, `off`, `criterio`, `tarea`, `mime`, `data` (base64, se agrega al enviar), `takenAt`, `nota?` | Guarda el JPEG en Drive (carpeta por planilla y registro), lo anota en `_PIE_FOTOS` y agrega una nota en la celda. |
| `fum` | `accion:'abrir'` + `off, criterio, tarea, obs, accionInmediata, accionCorrectiva, plazo`; `accion:'cerrar'` + `num\|ref, fecha, resultado ('Anulada' o el estado de la reinspección)`; `accion:'editar'` + `num\|ref` y campos | Lleva el índice en `_PIE_FUM` y pasa la FUM al FOG 01 (número correlativo). Devuelve `fum` (N°). |
| `liberar` | `etapa`, `fecha` (día de la decisión), `resumen`, `plano`, `elemento` | Vuelve a verificar con `RL.check` (Beta.gs). Si pasa, agrega una fila en LIBERACIONES. Si no pasa, error con el motivo. No duplica. |
| `pin` | `accion:'poner'\|'mover'\|'quitar'\|'color'`, `pin` (id), `plano`, `x`, `y`, `alc:{k,v}`, `pts?` (zona), `color?`, `elemento`, `piso` | Mantiene `_PIE_PINES` (las filas quitadas quedan inactivas). |

## Hojas de la planilla que toca la app

| Hoja | Lectura | Escritura |
|---|---|---|
| Hojas de planilla (`1`…`44`) | `parseSheet_` detecta bloques: encabezado RESPONSABLE / PISO / SECTOR / ETAPA, y una tabla TAREA… | `create`, `update` |
| `DATOS` | Responsables, abreviaturas e instrumentos | — |
| `EQUIPOS DE MEDICIÓN` | N° de serie y vencimiento | Se crea desde el menú |
| `LIBERACIONES` | Sí | `liberar` |
| `_PIE_LOG` (oculta) | ids procesados | Cada operación |
| `_PIE_FOTOS`, `_PIE_FUM`, `_PIE_PINES` (ocultas) | Índices | Fotos, FUM, pines |

El detalle del lector de bloques está en [referencia/LECTURA_PLANILLAS.md](referencia/LECTURA_PLANILLAS.md).
