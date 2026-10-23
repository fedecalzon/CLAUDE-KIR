-- PIE · Funciones RPC que reemplazan las acciones de Code.gs (handle_/catalog_/batch_).
--
-- Alcance de esta primera etapa:
--   api_catalog()        -> reemplaza action=catalog (lectura completa, igual forma que usa app/index.html)
--   api_batch(ops)        -> reemplaza action=batch, ops 'create' y 'update' (el 90%+ del tráfico real:
--                             alta de registro y marcado AP/RZ/N/A de controles)
--
-- Pendiente para una próxima etapa (quedan documentados en README.md, no implementados acá
-- porque cada uno tiene lógica propia no trivial que conviene migrar con cuidado y tests):
--   - op 'photo'   (hoy sube a Drive y escribe nota en OBSERVACIONES + _PIE_FOTOS)
--   - op 'fum'     (numeración correlativa + escritura en el FOG 01 externo)
--   - op 'liberar' (checklist de liberación de etapa con las reglas de LIBERACIONES)
-- Mientras tanto esas tres devuelven code='not_implemented' en vez de fallar en silencio.

create or replace function api_catalog() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'datos', (
      select jsonb_build_object(
        'obra', o.obra, 'direccion', o.direccion, 'licitacion', o.licitacion,
        'metodos', o.metodos, 'estados', o.estados,
        'responsables', coalesce((select jsonb_agg(jsonb_build_object('nombre', r.nombre, 'abrev', r.abrev))
                                   from responsables r), '[]'::jsonb),
        'instrumentos', coalesce((select jsonb_agg(distinct e.equipo) from equipos e), '[]'::jsonb)
      )
      from obra_info o
    ),
    'fums', coalesce((select jsonb_agg(to_jsonb(f)) from fums f), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(e)) from equipos e), '[]'::jsonb),
    'liberaciones', coalesce((select jsonb_agg(to_jsonb(l)) from liberaciones l), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sheet', c.sheet, 'titulo', c.titulo, 'rubro', c.rubro, 'oculta', c.oculta,
        'crit', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', cr.id, 'idx', cr.idx, 'etapa', cr.etapa, 'tarea', cr.tarea, 'muestra', cr.muestra,
                   'criterio', cr.criterio, 'metodo', cr.metodo, 'instrumento', cr.instrumento
                 ) order by cr.idx), '[]'::jsonb)
                 from criterios cr where cr.categoria = c.sheet),
        'registros', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', reg.id, 'h', reg.h, 'sig', reg.sig, 'slots', reg.slots, 'resp', to_jsonb(reg.resp),
            'piso', reg.piso, 'sector', reg.sector, 'etapa', reg.etapa, 'elemento', reg.elemento, 'plano', reg.plano,
            'items', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'off', ctl.off, 'criterio_id', ctl.criterio_id, 'documento', ctl.documento,
                'fecha', ctl.fecha, 'resp', ctl.resp, 'estado', ctl.estado, 'instrumento', ctl.instrumento,
                'fum', ctl.fum_n, 'obs', ctl.obs,
                'fotos', (select coalesce(jsonb_agg(jsonb_build_object('archivo_id', fo.archivo_id, 'enlace', fo.enlace)), '[]'::jsonb)
                          from fotos fo where fo.control_id = ctl.id)
              ) order by ctl.off), '[]'::jsonb)
              from controles ctl where ctl.registro_id = reg.id
            )
          ) order by reg.h nulls last, reg.creado_en), '[]'::jsonb)
          from registros reg where reg.categoria = c.sheet
        )
      ) order by c.orden nulls last, c.sheet)
      from categorias c
    ), '[]'::jsonb)
  );
$$;

-- Da de alta un registro nuevo (antes: copiar el bloque modelo). En el esquema relacional
-- no hace falta elegir/copiar un "bloque base": todo registro de una categoría usa los
-- mismos criterios (la plantilla ya vive en la tabla criterios), así que se simplifica
-- a insertar el registro y un control vacío por cada criterio de la categoría.
create or replace function api_op_create(p_id text, p_sheet text, p_by text,
                                          p_resp text[], p_piso text, p_sector text,
                                          p_etapa text, p_elemento text, p_plano text)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_reg registros;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'registro_id', v_existing.registro_id);
  end if;

  insert into registros (categoria, resp, piso, sector, etapa, elemento, plano)
  values (p_sheet, coalesce(p_resp, '{}'), coalesce(p_piso, ''), coalesce(p_sector, ''),
          coalesce(p_etapa, ''), coalesce(p_elemento, ''), coalesce(p_plano, ''))
  returning * into v_reg;

  insert into controles (registro_id, criterio_id, off, estado)
  select v_reg.id, cr.id, cr.idx, ''
  from criterios cr where cr.categoria = p_sheet;

  insert into operaciones (id, op, registro_id, by_)
  values (p_id, 'create', v_reg.id, coalesce(p_by, ''));

  return jsonb_build_object('id', p_id, 'ok', true, 'registro_id', v_reg.id);
end;
$$;

-- Marca AP/RZ/N/A y completa documento/fecha/resp/instrumento/obs de los controles de un registro.
-- p_items: [{"off": 3, "documento": "...", "fecha": "2026-10-23", "resp": "FC", "estado": "AP", "obs": "..."}...]
create or replace function api_op_update(p_id text, p_registro_id uuid, p_by text, p_items jsonb)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_item jsonb;
  v_warnings text[] := '{}';
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'registro_id', v_existing.registro_id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    update controles set
      documento    = coalesce(v_item->>'documento', documento),
      fecha        = coalesce((v_item->>'fecha')::date, fecha),
      resp         = coalesce(v_item->>'resp', resp),
      estado       = coalesce(v_item->>'estado', estado),
      instrumento  = coalesce(v_item->>'instrumento', instrumento),
      fum_n        = coalesce(v_item->>'fum', fum_n),
      obs          = coalesce(v_item->>'obs', obs),
      actualizado_en = now()
    where registro_id = p_registro_id and off = (v_item->>'off')::int;
    if not found then
      v_warnings := v_warnings || ('No se encontró el control en offset ' || (v_item->>'off'));
    end if;
  end loop;

  insert into operaciones (id, op, registro_id, by_, warnings)
  values (p_id, 'update', p_registro_id, coalesce(p_by, ''), array_to_string(v_warnings, ' | '));

  return jsonb_build_object('id', p_id, 'ok', true, 'registro_id', p_registro_id, 'warnings', to_jsonb(v_warnings));
end;
$$;

-- Registra la foto una vez que YA está subida a Drive. A diferencia de Code.gs (que recibía
-- el base64 y subía el archivo), acá Postgres no puede hablar con la API de Drive: la subida
-- la hace la Edge Function supabase/functions/upload-photo (ver README), que decodifica,
-- sube a Drive con la misma convención de carpeta/nombre que ya usa opPhoto_, y recién después
-- llama a este RPC con el archivo_id/enlace resultantes.
create or replace function api_op_photo(p_id text, p_control_id uuid, p_archivo_id text, p_enlace text, p_by text)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_registro_id uuid;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'url', v_existing.extra);
  end if;

  select registro_id into v_registro_id from controles where id = p_control_id;
  if v_registro_id is null then
    raise exception 'No se encontró el control de la foto' using errcode = 'P0002';
  end if;

  insert into fotos (control_id, archivo_id, enlace, inspector)
  values (p_control_id, p_archivo_id, p_enlace, coalesce(p_by, ''))
  on conflict (control_id, archivo_id) do nothing;

  insert into operaciones (id, op, registro_id, by_, extra) values (p_id, 'photo', v_registro_id, coalesce(p_by, ''), p_enlace);

  return jsonb_build_object('id', p_id, 'ok', true, 'url', p_enlace, 'registro_id', v_registro_id);
end;
$$;

-- ---------- FUM: abrir / cerrar / editar ----------
-- A diferencia de Code.gs (nextFumNumber_ concilia el máximo del FOG 01 con el de la hoja
-- local porque podían desincronizarse), acá hay una sola fuente de verdad: fum_numero_seq.
-- La escritura en el FOG 01 externo queda para la Edge Function de sync (ver README), no acá.

create or replace function api_op_fum_abrir(p_id text, p_control_id uuid, p_by text, p_accion_inmediata text,
                                             p_plazo date, p_accion_correctiva text, p_obs text)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_ctl record;
  v_open_num int;
  v_num int;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'fum', nullif(v_existing.extra, '')::int);
  end if;

  select ctl.id, ctl.registro_id, ctl.obs, cr.categoria, cr.tarea, cr.criterio, reg.elemento, reg.piso, reg.sector
    into v_ctl
    from controles ctl
    join criterios cr on cr.id = ctl.criterio_id
    join registros reg on reg.id = ctl.registro_id
   where ctl.id = p_control_id;
  if not found then raise exception 'No se encontró el control rechazado' using errcode = 'P0002'; end if;

  -- si ya hay una FUM abierta para este control, se reutiliza (cubre reintentos sin id de operación)
  select numero into v_open_num from fums where control_id = p_control_id and estado = 'Abierta' limit 1;
  if v_open_num is not null then
    insert into operaciones (id, op, registro_id, by_, extra) values (p_id, 'fum', v_ctl.registro_id, coalesce(p_by, ''), v_open_num::text);
    return jsonb_build_object('id', p_id, 'ok', true, 'fum', v_open_num, 'warnings', jsonb_build_array('Ya existía la FUM ' || v_open_num));
  end if;

  v_num := nextval('fum_numero_seq');
  insert into fums (numero, control_id, categoria, elemento, piso, sector, tarea, criterio, observacion,
                     accion_correctiva, reinspeccion_prevista, detectado_por, accion_inmediata)
  values (v_num, p_control_id, v_ctl.categoria, v_ctl.elemento, v_ctl.piso, v_ctl.sector, v_ctl.tarea, v_ctl.criterio,
          coalesce(nullif(p_obs, ''), v_ctl.obs, ''), coalesce(p_accion_correctiva, ''), p_plazo, coalesce(p_by, ''),
          case when p_accion_inmediata in ('Reparar', 'Recambio', 'Recalificar', 'Dejar como esta')
               then p_accion_inmediata else 'Reparar' end);

  update controles set fum_n = v_num::text where id = p_control_id;

  insert into operaciones (id, op, registro_id, by_, extra) values (p_id, 'fum', v_ctl.registro_id, coalesce(p_by, ''), v_num::text);

  return jsonb_build_object('id', p_id, 'ok', true, 'fum', v_num, 'registro_id', v_ctl.registro_id);
end;
$$;

create or replace function api_op_fum_cerrar(p_id text, p_numero int, p_by text, p_resultado text, p_fecha date)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_fum fums;
  v_reg_id uuid;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'fum', p_numero);
  end if;

  select * into v_fum from fums where numero = p_numero;
  if not found then raise exception 'No se encontró la FUM %', p_numero using errcode = 'P0002'; end if;

  update fums set
    estado = case when p_resultado = 'Anulada' then 'Anulada' else 'Cerrada' end,
    fecha_cierre = coalesce(p_fecha, current_date),
    cerrado_por = coalesce(p_by, ''),
    resultado_nota = coalesce(p_resultado, '')
  where numero = p_numero;

  select registro_id into v_reg_id from controles where id = v_fum.control_id;
  insert into operaciones (id, op, registro_id, by_, extra) values (p_id, 'fum', v_reg_id, coalesce(p_by, ''), p_numero::text);

  return jsonb_build_object('id', p_id, 'ok', true, 'fum', p_numero);
end;
$$;

create or replace function api_op_fum_editar(p_id text, p_numero int, p_by text, p_op jsonb)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
  v_fum fums;
  v_reg_id uuid;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'fum', p_numero);
  end if;

  select * into v_fum from fums where numero = p_numero;
  if not found then raise exception 'No se encontró la FUM %', p_numero using errcode = 'P0002'; end if;

  update fums set
    accion_correctiva    = coalesce(p_op->>'accionCorrectiva', accion_correctiva),
    reinspeccion_prevista = coalesce((p_op->>'plazo')::date, reinspeccion_prevista),
    observacion           = coalesce(p_op->>'obs', observacion),
    accion_inmediata       = coalesce(p_op->>'accionInmediata', accion_inmediata)
  where numero = p_numero;

  select registro_id into v_reg_id from controles where id = v_fum.control_id;
  insert into operaciones (id, op, registro_id, by_, extra) values (p_id, 'fum', v_reg_id, coalesce(p_by, ''), p_numero::text);

  return jsonb_build_object('id', p_id, 'ok', true, 'fum', p_numero);
end;
$$;

create or replace function api_op_fum(p_id text, p_op jsonb) returns jsonb
language plpgsql as $$
begin
  if p_op->>'accion' = 'abrir' then
    return api_op_fum_abrir(p_id, (p_op->>'control_id')::uuid, p_op->>'by', p_op->>'accionInmediata',
      (p_op->>'plazo')::date, p_op->>'accionCorrectiva', p_op->>'obs');
  elsif p_op->>'accion' = 'cerrar' then
    return api_op_fum_cerrar(p_id, (p_op->>'numero')::int, p_op->>'by', p_op->>'resultado', (p_op->>'fecha')::date);
  elsif p_op->>'accion' = 'editar' then
    return api_op_fum_editar(p_id, (p_op->>'numero')::int, p_op->>'by', p_op);
  else
    raise exception 'Acción de FUM desconocida: %', p_op->>'accion' using errcode = 'P0001';
  end if;
end;
$$;

-- La app sólo ofrece liberar con la etapa sin pendientes, sin RZ ni FUM abiertas, plano
-- vigente e instrumentos en regla: esa validación vive en el cliente/frontend (igual que
-- hoy), este RPC sólo registra la liberación ya decidida.
create or replace function api_op_liberar(p_id text, p_registro_id uuid, p_etapa text, p_by text,
                                           p_resumen text, p_plano text, p_obs text)
returns jsonb language plpgsql as $$
declare
  v_existing operaciones;
begin
  select * into v_existing from operaciones where id = p_id;
  if found then
    return jsonb_build_object('id', p_id, 'ok', true, 'dup', true, 'registro_id', v_existing.registro_id);
  end if;
  if coalesce(p_etapa, '') = '' then raise exception 'Falta la etapa a liberar' using errcode = 'P0001'; end if;

  insert into liberaciones (registro_id, etapa, quien, resumen, plano, obs)
  values (p_registro_id, p_etapa, coalesce(p_by, ''), coalesce(p_resumen, ''), coalesce(p_plano, ''), coalesce(p_obs, ''));

  insert into operaciones (id, op, registro_id, by_) values (p_id, 'liberar', p_registro_id, coalesce(p_by, ''));

  return jsonb_build_object('id', p_id, 'ok', true, 'registro_id', p_registro_id);
end;
$$;

-- Despacha un lote de operaciones, igual forma que hoy batch_(ss, ops). Pensado para que
-- app/index.html llame UNA función y siga mandando el mismo array de ops que ya arma.
create or replace function api_batch(p_ops jsonb) returns jsonb
language plpgsql as $$
declare
  v_op jsonb;
  v_kind text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_kind := v_op->>'op';
    begin
      if v_kind = 'create' then
        v_result := api_op_create(v_op->>'id', v_op->>'sheet', v_op->>'by',
          (select array_agg(x) from jsonb_array_elements_text(coalesce(v_op->'resp', '[]'::jsonb)) x),
          v_op->>'piso', v_op->>'sector', v_op->>'etapa', v_op->>'elemento', v_op->>'plano');
      elsif v_kind = 'update' then
        v_result := api_op_update(v_op->>'id', (v_op->>'registro_id')::uuid, v_op->>'by', coalesce(v_op->'items', '[]'::jsonb));
      elsif v_kind = 'photo' then
        v_result := api_op_photo(v_op->>'id', (v_op->>'control_id')::uuid, v_op->>'archivo_id', v_op->>'enlace', v_op->>'by');
      elsif v_kind = 'fum' then
        v_result := api_op_fum(v_op->>'id', v_op);
      elsif v_kind = 'liberar' then
        v_result := api_op_liberar(v_op->>'id', (v_op->>'registro_id')::uuid, v_op->>'etapa', v_op->>'by',
          v_op->>'resumen', v_op->>'plano', v_op->>'obs');
      else
        v_result := jsonb_build_object('id', v_op->>'id', 'ok', false, 'code', 'bad_request', 'error', 'Operación desconocida: ' || v_kind);
      end if;
    exception when others then
      v_result := jsonb_build_object('id', v_op->>'id', 'ok', false, 'code', 'error', 'error', sqlerrm, 'sqlstate', sqlstate);
    end;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;
