-- PIE · Esquema Postgres/Supabase (reemplazo de Google Sheets como base de datos)
--
-- Mapeo desde la planilla actual:
--   hoja de categoría (ej. "6 - HORMIGON ARMADO")  -> categorias
--   fila de criterio dentro del bloque modelo      -> criterios   (la "plantilla" de PRE/DURANTE/POST/DOC)
--   bloque (RESPONSABLE/PISO/SECTOR/ETAPA + tabla)  -> registros
--   fila de la tabla dentro de un bloque            -> controles
--   _PIE_FOTOS                                      -> fotos
--   _PIE_FUM / "FUM - Rechazos"                      -> fums
--   EQUIPOS DE MEDICIÓN                              -> equipos
--   LIBERACIONES                                     -> liberaciones
--   _PIE_LOG (idempotencia de doPost/batch)          -> operaciones
--
-- Convención: se conservan los nombres cortos que ya usa el cliente (h, off, resp, obs, etc.)
-- para que la migración de datos y la futura adaptación de app/index.html sean mecánicas.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- Catálogo
-- ------------------------------------------------------------------

create table categorias (
  sheet   text primary key,         -- nombre de hoja original (ej. "6"), clave natural y estable
  titulo  text not null default '',
  rubro   text not null default 'Otros',
  oculta  boolean not null default false,
  orden   integer                   -- posición dentro de PIE.RUBROS, para no perder el orden de navegación
);

-- Plantilla de criterios de cada categoría (lo que hoy es el bloque modelo + columna de cada hoja).
create table criterios (
  id           uuid primary key default gen_random_uuid(),
  categoria    text not null references categorias(sheet) on delete cascade,
  idx          integer not null,    -- índice dentro de crit[] tal como lo arma hoy toClientCategory_
  etapa        text not null default '',
  tarea        text not null default '',
  muestra      text not null default '',
  criterio     text not null default '',
  metodo       text not null default '',
  instrumento  text not null default '',
  unique (categoria, idx)
);

-- Reemplaza la hoja DATOS: datos generales de obra + listas fijas (responsables, métodos, estados).
-- Los instrumentos ya no hace falta listarlos aparte: salen de equipos.equipo (distinct).
create table obra_info (
  id           boolean primary key default true check (id),  -- fuerza una sola fila
  obra         text not null default '',
  direccion    text not null default '',
  licitacion   text not null default '',
  metodos      text[] not null default '{IV,ID}',
  estados      text[] not null default '{AP,RZ}'
);
insert into obra_info (id) values (true);

create table responsables (
  nombre  text primary key,
  abrev   text not null default ''
);

-- ------------------------------------------------------------------
-- Datos operativos
-- ------------------------------------------------------------------

-- Un registro = un bloque (antes: copiar el bloque modelo y pegarlo debajo del último).
create table registros (
  id          uuid primary key default gen_random_uuid(),
  categoria   text not null references categorias(sheet) on delete cascade,
  h           integer,              -- fila del bloque en la hoja original (trazabilidad durante la transición)
  sig         text,                 -- hash de criterios del bloque (hoy identifica qué plantilla sigue)
  slots       integer not null default 1,
  resp        text[] not null default '{}',   -- responsables (puede haber más de uno por bloque)
  piso        text not null default '',
  sector      text not null default '',
  etapa       text not null default '',
  elemento    text not null default '',
  plano       text not null default '',       -- documento/plano único del registro (v1.6+)
  creado_en   timestamptz not null default now(),
  unique (categoria, h)   -- permite reimportar el libro sin duplicar registros (upsert por categoría+fila)
);
create index registros_categoria_idx on registros(categoria);

-- Un control = una fila de la tabla (un criterio marcado AP/RZ/N/A dentro de un registro).
create table controles (
  id           uuid primary key default gen_random_uuid(),
  registro_id  uuid not null references registros(id) on delete cascade,
  criterio_id  uuid not null references criterios(id),
  off          integer not null,     -- offset dentro del bloque (igual que hoy, para no romper referencias del cliente)
  documento    text not null default '',
  fecha        date,
  resp         text not null default '',
  estado       text not null default '' check (estado in ('', 'AP', 'RZ', 'NA')),
  instrumento  text not null default '',  -- instrumento con N° de serie elegido (v1.7), distinto del tipo en criterios
  fum_n        text not null default '',
  obs          text not null default '',
  actualizado_en timestamptz not null default now(),
  unique (registro_id, off)
);
create index controles_registro_idx on controles(registro_id);
create index controles_estado_idx on controles(estado) where estado <> '';

create table fotos (
  id           uuid primary key default gen_random_uuid(),
  control_id   uuid references controles(id) on delete cascade,
  archivo_id   text not null,       -- id del archivo en Drive (se sigue usando Drive para las fotos)
  enlace       text not null,
  fecha        timestamptz not null default now(),
  inspector    text not null default '',
  unique (control_id, archivo_id)
);
create index fotos_control_idx on fotos(control_id);

create table fums (
  id                     uuid primary key default gen_random_uuid(),
  numero                 integer not null unique,
  fecha_apertura         date not null default current_date,
  control_id             uuid references controles(id),
  categoria              text,
  elemento               text not null default '',
  piso                   text not null default '',
  sector                 text not null default '',
  tarea                  text not null default '',
  criterio               text not null default '',
  observacion            text not null default '',
  accion_correctiva      text not null default '',
  reinspeccion_prevista  date,
  detectado_por          text not null default '',
  estado                 text not null default 'Abierta' check (estado in ('Abierta', 'Cerrada', 'Anulada')),
  fecha_cierre           date,
  cerrado_por            text not null default '',
  resultado_nota         text not null default '',
  accion_inmediata       text not null default '',
  fila_fog01             integer      -- fila escrita en el FOG 01 externo, mientras siga existiendo
);

create table equipos (
  id                  uuid primary key default gen_random_uuid(),
  equipo              text not null,
  serie               text not null default '',
  calibracion_vence   date,
  certificado         text not null default '',
  observaciones       text not null default '',
  unique (equipo, serie)
);

create table liberaciones (
  id          uuid primary key default gen_random_uuid(),
  fecha       timestamptz not null default now(),
  registro_id uuid references registros(id),
  etapa       text not null,
  quien       text not null default '',
  resumen     jsonb not null default '{}',
  plano       text not null default ''
);

-- Idempotencia de operaciones enviadas desde la cola offline del celular (reemplaza _PIE_LOG).
create table operaciones (
  id          text primary key,     -- id generado por el cliente, igual que hoy
  creado_en   timestamptz not null default now(),
  op          text not null,        -- create | update | photo | fum | liberar
  registro_id uuid,
  by_         text not null default '',
  warnings    text not null default '',
  extra       text not null default ''  -- url de foto o número de FUM, igual que hoy
);

-- ------------------------------------------------------------------
-- Sync de solo lectura hacia Google Sheets (ver supabase/README.md)
-- ------------------------------------------------------------------
create table sheets_sync_pendiente (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  uuid,
  creado_en    timestamptz not null default now(),
  procesado    boolean not null default false
);

create or replace function marcar_pendiente_sync() returns trigger as $$
declare
  v_registro_id uuid;
begin
  -- acceso vía jsonb porque esta función se usa en varias tablas y no todas tienen
  -- columna registro_id (acceder a new.registro_id directo rompe si no existe)
  v_registro_id := coalesce((to_jsonb(new)->>'registro_id')::uuid, new.id);
  insert into sheets_sync_pendiente (tabla, registro_id) values (tg_table_name, v_registro_id);
  return new;
end;
$$ language plpgsql;

create trigger controles_sync after insert or update on controles
  for each row execute function marcar_pendiente_sync();
create trigger registros_sync after insert or update on registros
  for each row execute function marcar_pendiente_sync();
