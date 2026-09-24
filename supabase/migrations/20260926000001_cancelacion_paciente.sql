-- =============================================================================
-- Cancelación de turnos por el paciente, con plazo límite configurable por clínica.
-- El plazo se controla en la base: aunque alguien llame a la API directamente,
-- fuera de plazo no se puede cancelar.
-- =============================================================================

-- Hasta cuántas horas antes del turno el paciente puede cancelarlo (24, 48, 72…).
alter table public.clinicas
  add column horas_limite_cancelacion integer not null default 48
  check (horas_limite_cancelacion between 1 and 168);

-- Quién y cuándo canceló (para que recepción distinga las cancelaciones del paciente).
alter table public.turnos
  add column cancelado_en timestamptz,
  add column cancelado_por_paciente boolean not null default false;

-- Momento límite para cancelar un turno desde la app.
create function app.cancelable_hasta(p_inicio timestamptz, p_horas integer) returns timestamptz
language sql immutable set search_path = '' as $$
  select p_inicio - make_interval(hours => p_horas);
$$;

-- Turnos del paciente actual, sin datos internos (notas_internas no se expone).
create function public.mis_turnos()
returns table (
  id uuid,
  clinica_id uuid,
  inicio timestamptz,
  fin timestamptz,
  estado public.estado_turno,
  servicio text,
  indicaciones_previas text,
  profesional text,
  cancelado_por_paciente boolean,
  horas_limite_cancelacion integer,
  cancelable_hasta timestamptz,
  puede_cancelar boolean
)
language sql stable security definer set search_path = '' as $$
  select
    t.id, t.clinica_id, t.inicio, t.fin, t.estado,
    s.nombre, s.indicaciones_previas, p.nombre_visible,
    t.cancelado_por_paciente,
    c.horas_limite_cancelacion,
    app.cancelable_hasta(t.inicio, c.horas_limite_cancelacion),
    t.estado in ('agendado', 'confirmado', 'reprogramar_solicitado')
      and c.estado_suscripcion in ('activa', 'gracia')
      and now() <= app.cancelable_hasta(t.inicio, c.horas_limite_cancelacion)
  from public.turnos t
  join public.clinicas c on c.id = t.clinica_id
  join public.servicios s on s.id = t.servicio_id
  join public.profesionales p on p.id = t.profesional_id
  where t.paciente_id in (select app.mis_paciente_ids())
  order by t.inicio;
$$;
revoke all on function public.mis_turnos() from public, anon;
grant execute on function public.mis_turnos() to authenticated;

-- El paciente cancela uno de sus turnos, solo dentro del plazo de su clínica.
create function public.cancelar_mi_turno(p_turno uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select t.id, t.inicio, t.estado, c.horas_limite_cancelacion, c.estado_suscripcion
    into v
  from public.turnos t
  join public.clinicas c on c.id = t.clinica_id
  where t.id = p_turno
    and t.paciente_id in (select app.mis_paciente_ids())
  for update of t;

  if not found then
    raise exception 'No encontramos ese turno' using errcode = 'P0001', hint = 'no_encontrado';
  end if;
  if v.estado not in ('agendado', 'confirmado', 'reprogramar_solicitado') then
    raise exception 'Este turno ya no se puede cancelar' using errcode = 'P0001', hint = 'estado';
  end if;
  if v.estado_suscripcion not in ('activa', 'gracia') then
    raise exception 'En este momento no se pueden hacer cambios desde la app. Comunicate con la clínica'
      using errcode = 'P0001', hint = 'clinica_bloqueada';
  end if;
  if now() > app.cancelable_hasta(v.inicio, v.horas_limite_cancelacion) then
    raise exception 'Estás fuera de las horas posibles para cancelar. Los turnos se pueden cancelar hasta % horas antes. Comunicate con la clínica',
      v.horas_limite_cancelacion
      using errcode = 'P0001', hint = 'fuera_de_plazo';
  end if;

  update public.turnos
     set estado = 'cancelado', cancelado_en = now(), cancelado_por_paciente = true
   where id = p_turno;
end $$;
revoke all on function public.cancelar_mi_turno(uuid) from public, anon;
grant execute on function public.cancelar_mi_turno(uuid) to authenticated;

-- Al cancelar desde el panel también se registra cuándo; el paciente no puede
-- marcar cancelado_por_paciente desde afuera de la función, ni el equipo tampoco.
create function app.registrar_cancelacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if app.es_cliente() then new.cancelado_por_paciente := false; end if;
    new.cancelado_en := case when new.estado = 'cancelado' then coalesce(new.cancelado_en, now()) end;
    return new;
  end if;
  if new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    new.cancelado_en := coalesce(new.cancelado_en, now());
  elsif new.estado <> 'cancelado' then
    new.cancelado_en := null;
    new.cancelado_por_paciente := false;
  end if;
  if app.es_cliente() then
    -- Desde el panel nunca se marca como "cancelado por el paciente".
    new.cancelado_por_paciente := case when new.estado = 'cancelado' then old.cancelado_por_paciente else false end;
  end if;
  return new;
end $$;
create trigger registrar_cancelacion before insert or update on public.turnos
  for each row execute function app.registrar_cancelacion();
