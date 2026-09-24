-- Autor de la auditoría para operaciones hechas desde el servidor.
-- Con service_role no hay auth.uid(); el servidor informa quién pidió la operación
-- en el header x-actor-id. Solo se acepta si el JWT es de service_role (un cliente
-- no puede falsificarlo).
create function app.actor_id() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_actor text;
begin
  if auth.uid() is not null then
    return auth.uid();
  end if;
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then
    v_actor := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id';
    if v_actor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v_actor::uuid;
    end if;
  end if;
  return null;
end $$;

create or replace function app.auditar_cambio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_cols text[];
  v_clinica uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select array_agg(key order by key) into v_cols
    from jsonb_each(v_row) n
    where n.value is distinct from v_old -> n.key;
  end if;
  v_clinica := case when tg_table_name = 'clinicas' then (v_row ->> 'id')::uuid
                    else (v_row ->> 'clinica_id')::uuid end;
  insert into public.auditoria (clinica_id, user_id, accion, entidad, entidad_id, detalle, ip)
  values (
    v_clinica,
    app.actor_id(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'paciente_id', v_row ->> 'user_id'),
    case when v_cols is not null then jsonb_build_object('columnas', v_cols) end,
    nullif(app.ip_actual(), '')
  );
  return null;
end $$;

-- Cierre de sesiones tolerante a permisos: si el rol dueño no puede borrar en
-- auth.sessions, no se bloquea la desactivación (RLS ya corta el acceso al
-- instante); queda un aviso en el log. Ver docs/produccion.md para verificarlo.
create or replace function app.cerrar_sesiones(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user;
exception when insufficient_privilege then
  raise warning 'No se pudieron cerrar las sesiones de %: sin permiso sobre auth.sessions', p_user;
end $$;
revoke all on function app.cerrar_sesiones(uuid) from public, authenticated;
