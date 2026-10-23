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
| `functions.sql` | Funciones RPC `api_catalog()` y `api_batch(ops)` que reemplazan las acciones `catalog`/`batch` de `Code.gs`: los 5 ops (`create`, `update`, `photo`, `fum`, `liberar`) están implementados. Probadas end-to-end contra Postgres real (alta de registro, reintento idempotente, marcado AP/RZ, abrir/reutilizar/editar/cerrar FUM, foto, liberar, y que un error en una operación no rompe el resto del batch). |
| `migrate-from-sheets.js` | Migración única: descarga el catálogo real desde el Web App de Apps Script ya desplegado (`action=catalog`, el mismo que usa `app/index.html` hoy) y lo sube a Supabase. No reimplementa el parseo de la planilla — reusa `catalog_`/`toClientCategory_`, que ya están probados en producción. |
| `functions/upload-photo/filename.js` | Nombre de archivo y ruta de carpeta en Drive para una foto de control, mismo criterio que `fileSafe_`/`photoFolder_` de `Code.gs`. Probado con Node. |
| `functions/upload-photo/index.ts` | Edge Function (Deno) que sube la foto a Drive con una cuenta de servicio y después llama a `api_op_photo`. **Sin probar** — ver aviso abajo. |

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

## `fum`: diferencia a propósito con Code.gs

`nextFumNumber_` en Apps Script tenía que conciliar el máximo del FOG 01 externo con el de la
hoja local porque podían desincronizarse. Acá hay una sola fuente de verdad (`fum_numero_seq`),
así que alcanza con una secuencia de Postgres — más simple y segura ante cargas concurrentes
de dos inspectores a la vez. Lo que `api_op_fum*` **no hace** es escribir en el FOG 01 externo
(`fogAppend_`/`fogFlushPending_` en `Code.gs`): eso es, igual que el reporte en la planilla PIE,
una escritura hacia Sheets — queda para la Edge Function de sync del punto 2 de abajo, que se
extiende para tocar también el FOG 01 además de la planilla PIE.

## `photo`: cambia la forma de la operación (a propósito)

Postgres no puede hablar con la API de Drive, así que el op `photo` ya no manda el JPG en
base64 directo al RPC como hacía con Apps Script. Ahora son dos pasos:

1. El celular llama a la Edge Function `upload-photo` (sube el archivo a Drive).
2. La Edge Function llama a `api_batch` con el op `photo` ya resuelto (`archivo_id`, `enlace`),
   que es lo que graba `api_op_photo`.

`app/index.html` va a necesitar este cambio de todas formas en el paso 3 de abajo. La Edge
Function (`functions/upload-photo/index.ts`) está escrita pero **sin probar**: no hay Deno ni
una cuenta de servicio de Google en el entorno donde se armó esto. Antes de usarla en serio:

1. Crear una cuenta de servicio de Google Cloud, bajar su JSON, compartirle (Editor) la carpeta
   de Drive `PIE - Fotos de control - <tu libro>` que ya usa la app hoy.
2. Cargar `GOOGLE_SERVICE_ACCOUNT_JSON` y `DRIVE_ROOT_FOLDER_ID` como secrets de la función en
   Supabase.
3. `supabase functions deploy upload-photo` y subir una foto de prueba: confirmar que aparece
   en la carpeta correcta con el nombre esperado y que la fila en `fotos` se crea.

La lógica de nombre/carpeta (`filename.js`) sí está probada con Node y no cambia aunque se
ajuste el resto de la función.

## Siguiente paso

1. ~~Cerrar `photo`/`fum`/`liberar` como funciones RPC~~ — hecho (`api_op_photo`, `api_op_fum*`,
   `api_op_liberar` en `functions.sql`, probadas contra Postgres real).
2. Edge Function o cron en Supabase que lea `sheets_sync_pendiente` (ya la crea `schema.sql`
   con triggers en `registros`/`controles`/`fums`/`liberaciones`) y escriba esos cambios a la
   planilla PIE y al FOG 01 vía Google Sheets API REST — en background, nunca en el camino de
   respuesta al celular.
3. Probar de verdad la Edge Function `upload-photo` (ver sección de arriba) con una cuenta de
   servicio real.
4. Cambiar las llamadas de red en `app/index.html` (`catalog`/`sheet`/`batch`, más el nuevo paso
   de subir la foto antes del batch) para apuntar a Supabase. La cola offline/reintentos/ids
   idempotentes del cliente no cambia, sólo el transporte.
5. Piloto en paralelo al sistema actual con un rubro chico antes del corte general.
