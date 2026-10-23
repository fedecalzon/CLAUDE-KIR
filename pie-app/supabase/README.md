# PIE · Migración de Google Sheets a Supabase (etapa 1)

Contexto completo de por qué: Sheets está hoy en el camino crítico de cada carga desde el
celular (`SpreadsheetApp`, `LockService.getDocumentLock()`, escrituras celda por celda en
`apps-script/Code.gs`), lo que agrega latencia y serializa cargas de inspectores distintos.
Esta carpeta arma el reemplazo: una base Postgres (Supabase) para lectura/escritura de la app,
dejando Sheets como reporte de solo lectura para el equipo.

## Qué hay acá

| Archivo | Qué hace |
|---|---|
| `schema.sql` | Tablas relacionales (ver mapeo abajo), probado contra Postgres 16. |
| `functions.sql` | Funciones RPC `api_catalog()` y `api_batch(ops)` que reemplazan las acciones `catalog`/`batch` de `Code.gs`. Probadas end-to-end (alta de registro, reintento idempotente, marcado AP, lectura). |
| `migrate-from-sheets.js` | Migración única: descarga el catálogo real desde el Web App de Apps Script ya desplegado (`action=catalog`, el mismo que usa `app/index.html` hoy) y lo sube a Supabase. No reimplementa el parseo de la planilla — reusa `catalog_`/`toClientCategory_`, que ya están probados en producción. |

## Mapeo hoja → tabla

```
hoja de categoría (ej. "6 - HORMIGON ARMADO")  -> categorias
fila de criterio del bloque modelo             -> criterios   (plantilla PRE/DURANTE/POST/DOC)
bloque (RESPONSABLE/PISO/SECTOR/ETAPA + tabla)  -> registros
fila de la tabla dentro de un bloque            -> controles
_PIE_FOTOS                                      -> fotos
_PIE_FUM / "FUM - Rechazos"                     -> fums
EQUIPOS DE MEDICIÓN                             -> equipos
LIBERACIONES                                    -> liberaciones
_PIE_LOG (idempotencia)                         -> operaciones
DATOS                                           -> obra_info + responsables
```

**Simplificación real, no un recorte:** en Sheets, dar de alta un registro significa elegir y
copiar un "bloque modelo" (formato, combinaciones, validaciones) porque los criterios viven
posicionalmente en la hoja. En el esquema relacional los criterios de una categoría son una
tabla (`criterios`) independiente de cualquier registro, así que un alta nueva es: insertar la
fila de `registros` + un `control` vacío por cada criterio de esa categoría. Ya no hace falta
`pickBaseBlock_`, copiar formato de celdas ni calcular dónde insertar filas.

## Cómo probarlo vos

```bash
# 1. Aplicar el esquema a un proyecto Supabase nuevo (SQL Editor del dashboard, o psql):
psql "$SUPABASE_DB_URL" -f schema.sql
psql "$SUPABASE_DB_URL" -f functions.sql

# 2. Exportar el catálogo real sin tocar nada todavía (deja los JSON en ./export):
node migrate-from-sheets.js --api "https://script.google.com/.../exec" --token "tu-clave-pie"

# 3. Revisar ./export/*.json, y recién ahí subir de verdad:
SUPABASE_URL="https://xxxx.supabase.co" SUPABASE_SERVICE_KEY="..." \
  node migrate-from-sheets.js --api "..." --token "..." --apply
```

La `--api` y `--token` son las mismas que ya tenés hoy en **PIE › Ver enlace de la app**. La
`SUPABASE_SERVICE_KEY` es la *service role key* (no la `anon`), porque esto corre una sola vez
a mano y necesita saltarse Row Level Security para poblar todo.

El script valida con un upsert por clave natural (`categoria+idx`, `categoria+h`,
`registro_id+off`, etc.), así que se puede correr más de una vez sin duplicar **excepto
`liberaciones`**, que no tiene clave natural — esa tabla conviene poblarla una sola vez.

## Qué falta (a propósito, para no migrar lógica compleja sin revisar con cuidado)

`api_batch` ya resuelve `create` y `update` (el grueso del tráfico real: alta de registro y
marcado AP/RZ/N/A). Estas tres operaciones devuelven `code: "not_implemented"` en vez de
fallar en silencio, y cada una tiene lógica de negocio propia que merece su propia revisión:

- **`photo`**: hoy sube a Drive, reduce la imagen y escribe nota en OBSERVACIONES + índice en
  `_PIE_FOTOS` (`Code.gs:743` `opPhoto_`). La parte de Drive se puede dejar igual; falta la
  función RPC que inserte en `fotos`.
- **`fum`**: numeración correlativa + fila nueva en el FOG 01 externo (`Code.gs:1036` `opFum_`,
  usa `fogSheet_`/`nextFumNumber_`). Necesita decidir si el FOG 01 se sigue escribiendo en
  Sheets (vía Sheets API, no Apps Script) o también se migra.
- **`liberar`**: checklist de liberación de etapa (`Code.gs:660` `opLiberar_`).

## Siguiente paso

1. Cerrar `photo`/`fum`/`liberar` como funciones RPC (uno por uno, con el mismo criterio de
   probarlas contra Postgres local antes de subir).
2. Edge Function o cron en Supabase que lea `sheets_sync_pendiente` (ya la crea `schema.sql`
   con triggers en `registros`/`controles`) y escriba esos cambios a Sheets vía Google Sheets
   API REST — en background, nunca en el camino de respuesta al celular.
3. Cambiar las 3 llamadas de red en `app/index.html` (`catalog`/`sheet`/`batch`) para apuntar a
   Supabase. La cola offline/reintentos/ids idempotentes del cliente no cambia, sólo el transporte.
4. Piloto en paralelo al sistema actual con un rubro chico antes del corte general.
