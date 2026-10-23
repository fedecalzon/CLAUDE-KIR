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
      elsif v_kind in ('photo', 'fum', 'liberar') then
        v_result := jsonb_build_object('id', v_op->>'id', 'ok', false, 'code', 'not_implemented',
          'error', 'Operación "' || v_kind || '" todavía no migrada a Supabase (ver supabase/README.md)');
      else
        v_result := jsonb_build_object('id', v_op->>'id', 'ok', false, 'code', 'bad_request', 'error', 'Operación desconocida: ' || v_kind);
      end if;
    exception when others then
      v_result := jsonb_build_object('id', v_op->>'id', 'ok', false, 'code', 'error', 'error', sqlerrm);
    end;
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;
