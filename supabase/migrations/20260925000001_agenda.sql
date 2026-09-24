-- =============================================================================
-- Fase 2 — Reglas de agenda y paquetes (aplicadas en la base)
-- =============================================================================

-- Validaciones de un turno al crearlo o modificarlo. Complementa las restricciones
-- de exclusión (sin superposición de profesional ni de recurso).
create function app.validar_turno() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_servicio record;
  v_paquete record;
  v_recurso_tipo text;
begin
  -- Los turnos cancelados o cerrados no se revalidan (solo cambia su estado).
  if new.estado in ('cancelado', 'no_asistio') then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.inicio is distinct from old.inicio or new.fin is distinct from old.fin
     or new.profesional_id is distinct from old.profesional_id
     or new.recurso_id is distinct from old.recurso_id
     or new.servicio_id is distinct from old.servicio_id
     or new.paquete_id is distinct from old.paquete_id
     or old.estado in ('cancelado', 'no_asistio') then

    select s.activo, s.requiere_recurso_tipo into v_servicio
    from public.servicios s where s.id = new.servicio_id;

    if tg_op = 'INSERT' and not v_servicio.activo then
      raise exception 'El servicio no está activo' using errcode = 'P0001', hint = 'servicio_inactivo';
    end if;

    if not exists (select 1 from public.profesionales p where p.id = new.profesional_id and p.activo) then
      raise exception 'El profesional no está activo' using errcode = 'P0001', hint = 'profesional_inactivo';
    end if;

    -- Si el servicio tiene profesionales asignados, el profesional debe ser uno de ellos.
    if exists (select 1 from public.servicio_profesional sp where sp.servicio_id = new.servicio_id)
       and not exists (
         select 1 from public.servicio_profesional sp
         where sp.servicio_id = new.servicio_id and sp.profesional_id = new.profesional_id
       ) then
      raise exception 'El profesional no realiza este servicio' using errcode = 'P0001', hint = 'profesional_no_realiza';
    end if;

    -- Recurso requerido por el servicio.
    if v_servicio.requiere_recurso_tipo is not null then
      if new.recurso_id is null then
        raise exception 'El servicio requiere un recurso de tipo %', v_servicio.requiere_recurso_tipo
          using errcode = 'P0001', hint = 'recurso_requerido';
      end if;
      select r.tipo into v_recurso_tipo from public.recursos r where r.id = new.recurso_id;
      if v_recurso_tipo is distinct from v_servicio.requiere_recurso_tipo then
        raise exception 'El recurso no es del tipo requerido (%)', v_servicio.requiere_recurso_tipo
          using errcode = 'P0001', hint = 'recurso_tipo';
      end if;
    end if;
    if new.recurso_id is not null and not exists (select 1 from public.recursos r where r.id = new.recurso_id and r.activo) then
      raise exception 'El recurso no está activo' using errcode = 'P0001', hint = 'recurso_inactivo';
    end if;

    -- Bloqueos de agenda (vacaciones, mantenimiento, etc.).
    if exists (
      select 1 from public.bloqueos_agenda b
      where b.clinica_id = new.clinica_id
        and tstzrange(b.desde, b.hasta, '[)') && tstzrange(new.inicio, new.fin, '[)')
        and (b.profesional_id = new.profesional_id or (new.recurso_id is not null and b.recurso_id = new.recurso_id))
    ) then
      raise exception 'El horario está bloqueado en la agenda' using errcode = 'P0001', hint = 'bloqueo';
    end if;

    -- Paquete: mismo servicio, con sesiones disponibles y vigente.
    if new.paquete_id is not null then
      select pq.servicio_id, pq.sesiones_totales, pq.sesiones_usadas, pq.vence_en into v_paquete
      from public.paquetes pq where pq.id = new.paquete_id;
      if v_paquete.servicio_id <> new.servicio_id then
        raise exception 'El paquete es de otro servicio' using errcode = 'P0001', hint = 'paquete_servicio';
      end if;
      if (tg_op = 'INSERT' or new.paquete_id is distinct from old.paquete_id)
         and v_paquete.sesiones_usadas >= v_paquete.sesiones_totales then
        raise exception 'El paquete no tiene sesiones disponibles' using errcode = 'P0001', hint = 'paquete_agotado';
      end if;
      if v_paquete.vence_en is not null and (new.inicio at time zone 'America/Montevideo')::date > v_paquete.vence_en then
        raise exception 'El paquete vence antes de la fecha del turno' using errcode = 'P0001', hint = 'paquete_vencido';
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger validar_turno before insert or update on public.turnos
  for each row execute function app.validar_turno();

-- Descuento de sesiones del paquete: al pasar a "atendido" se descuenta una; si se
-- corrige el estado (sale de "atendido") o se cambia el paquete, se devuelve.
create function app.descontar_paquete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean := tg_op = 'UPDATE' and old.estado = 'atendido' and old.paquete_id is not null;
  v_ahora boolean := new.estado = 'atendido' and new.paquete_id is not null;
begin
  if v_antes and (not v_ahora or old.paquete_id is distinct from new.paquete_id) then
    update public.paquetes set sesiones_usadas = sesiones_usadas - 1 where id = old.paquete_id;
  end if;
  if v_ahora and (not v_antes or old.paquete_id is distinct from new.paquete_id) then
    update public.paquetes set sesiones_usadas = sesiones_usadas + 1 where id = new.paquete_id;
  end if;
  return null;
exception when check_violation then
  raise exception 'El paquete no tiene sesiones disponibles' using errcode = 'P0001', hint = 'paquete_agotado';
end $$;

create trigger descontar_paquete after insert or update of estado, paquete_id on public.turnos
  for each row execute function app.descontar_paquete();

-- sesiones_usadas la mantiene la base: desde el panel no se edita a mano.
create function app.proteger_paquete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.es_cliente() then
    if tg_op = 'INSERT' then
      new.sesiones_usadas := 0;
    elsif new.sesiones_usadas is distinct from old.sesiones_usadas
       or new.paciente_id is distinct from old.paciente_id
       or new.servicio_id is distinct from old.servicio_id then
      raise exception 'Campo no modificable' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_paquete before insert or update on public.paquetes
  for each row execute function app.proteger_paquete();

-- Auditoría también de turnos y paquetes.
create trigger auditar after insert or update or delete on public.turnos
  for each row execute function app.auditar_cambio();
create trigger auditar after insert or update or delete on public.paquetes
  for each row execute function app.auditar_cambio();

-- Búsqueda de pacientes (nombre, apellido, cédula o celular) sin tildes.
create extension if not exists unaccent with schema extensions;

create function app.sin_tildes(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')));
$$;

create index pacientes_busqueda on public.pacientes
  (clinica_id, (app.sin_tildes(nombre || ' ' || apellido)));

-- Devuelve los pacientes visibles para el usuario (RLS aplica: no es security definer).
-- Cada palabra del texto debe aparecer en nombre + apellido ("maria perez" encuentra
-- "María José Pérez"); si el texto tiene 3 o más dígitos, también busca en cédula y celular.
create function public.buscar_pacientes(p_clinica uuid, p_texto text, p_limite integer default 30)
returns setof public.pacientes
language sql stable set search_path = '' as $$
  with t as (
    select
      array_remove(regexp_split_to_array(app.sin_tildes(trim(coalesce(p_texto, ''))), '\s+'), '') as palabras,
      regexp_replace(coalesce(p_texto, ''), '\D', '', 'g') as digitos
  )
  select p.*
  from public.pacientes p, t
  where p.clinica_id = p_clinica
    and (
      cardinality(t.palabras) = 0
      or not exists (
        select 1 from unnest(t.palabras) w
        where app.sin_tildes(p.nombre || ' ' || p.apellido) not like '%' || w || '%'
      )
      or (length(t.digitos) >= 3 and (
            p.cedula like '%' || t.digitos || '%'
            or regexp_replace(coalesce(p.celular, ''), '\D', '', 'g') like '%' || t.digitos || '%'))
    )
  order by p.apellido, p.nombre
  limit least(greatest(p_limite, 1), 100);
$$;
revoke all on function public.buscar_pacientes(uuid, text, integer) from public, anon;
grant execute on function public.buscar_pacientes(uuid, text, integer) to authenticated;
grant execute on function app.sin_tildes(text) to authenticated;
