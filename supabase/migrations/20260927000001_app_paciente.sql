-- =============================================================================
-- Fase 3 — Acciones del paciente desde la app
-- El paciente no escribe en la tabla turnos: usa estas funciones, que validan que
-- el turno sea suyo, que esté en un estado que lo permita y que la clínica esté
-- habilitada. Todo queda en la auditoría (trigger de turnos) con su usuario.
-- =============================================================================

create function app.turno_del_paciente(p_turno uuid)
returns table (id uuid, inicio timestamptz, estado public.estado_turno, estado_suscripcion public.estado_suscripcion)
language sql stable security definer set search_path = '' as $$
  select t.id, t.inicio, t.estado, c.estado_suscripcion
  from public.turnos t
  join public.clinicas c on c.id = t.clinica_id
  where t.id = p_turno and t.paciente_id in (select app.mis_paciente_ids());
$$;
revoke all on function app.turno_del_paciente(uuid) from public, authenticated;

-- Confirmar asistencia.
create function public.confirmar_mi_turno(p_turno uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select * into v from app.turno_del_paciente(p_turno);
  if not found then
    raise exception 'No encontramos ese turno' using errcode = 'P0001', hint = 'no_encontrado';
  end if;
  if v.estado_suscripcion not in ('activa', 'gracia') then
    raise exception 'En este momento no se pueden hacer cambios desde la app. Comunicate con la clínica'
      using errcode = 'P0001', hint = 'clinica_bloqueada';
  end if;
  if v.inicio <= now() then
    raise exception 'Este turno ya pasó' using errcode = 'P0001', hint = 'pasado';
  end if;
  if v.estado = 'confirmado' then
    return; -- ya estaba confirmado: no es un error
  end if;
  if v.estado not in ('agendado', 'reprogramar_solicitado') then
    raise exception 'Este turno ya no se puede confirmar' using errcode = 'P0001', hint = 'estado';
  end if;
  update public.turnos set estado = 'confirmado' where id = p_turno;
end $$;

-- Pedir que la clínica lo contacte para cambiar el turno.
create function public.pedir_reprogramacion_mi_turno(p_turno uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select * into v from app.turno_del_paciente(p_turno);
  if not found then
    raise exception 'No encontramos ese turno' using errcode = 'P0001', hint = 'no_encontrado';
  end if;
  if v.estado_suscripcion not in ('activa', 'gracia') then
    raise exception 'En este momento no se pueden hacer cambios desde la app. Comunicate con la clínica'
      using errcode = 'P0001', hint = 'clinica_bloqueada';
  end if;
  if v.inicio <= now() then
    raise exception 'Este turno ya pasó' using errcode = 'P0001', hint = 'pasado';
  end if;
  if v.estado = 'reprogramar_solicitado' then
    return;
  end if;
  if v.estado not in ('agendado', 'confirmado') then
    raise exception 'Este turno ya no se puede reprogramar desde la app' using errcode = 'P0001', hint = 'estado';
  end if;
  update public.turnos set estado = 'reprogramar_solicitado' where id = p_turno;
end $$;

revoke all on function public.confirmar_mi_turno(uuid) from public, anon;
revoke all on function public.pedir_reprogramacion_mi_turno(uuid) from public, anon;
grant execute on function public.confirmar_mi_turno(uuid) to authenticated;
grant execute on function public.pedir_reprogramacion_mi_turno(uuid) to authenticated;

-- Datos de la clínica que ve el paciente (marca y contacto), solo si es paciente activo de ella.
create function public.mi_clinica()
returns table (id uuid, nombre text, slug text, logo_url text, color_primario text, telefono_contacto text, direccion text, horas_limite_cancelacion integer)
language sql stable security definer set search_path = '' as $$
  select c.id, c.nombre, c.slug, c.logo_url, c.color_primario, c.telefono_contacto, c.direccion, c.horas_limite_cancelacion
  from public.clinicas c
  where c.id in (select app.mis_clinicas_como_paciente());
$$;
revoke all on function public.mi_clinica() from public, anon;
grant execute on function public.mi_clinica() to authenticated;
