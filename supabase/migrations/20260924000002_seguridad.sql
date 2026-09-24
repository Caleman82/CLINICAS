-- =============================================================================
-- Seguridad: funciones auxiliares, RLS, permisos, protecciones y auditoría.
--
-- Principios:
--  * RLS activado en TODAS las tablas de public (un test lo verifica).
--  * El rol anon no tiene ningún permiso sobre las tablas.
--  * Acceso del equipo = membresía activa en la clínica + rol.
--  * Estado de suscripción aplicado acá, no en la interfaz:
--      activa / gracia  → lectura y escritura
--      solo_lectura     → solo lectura
--      suspendida       → solo el admin_clinica puede leer (para exportar); nadie escribe
--  * El superadmin gestiona clínicas y pagos, pero NO ve datos de pacientes.
-- =============================================================================

grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares (security definer para evitar recursión de RLS)
-- -----------------------------------------------------------------------------

create function app.es_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plataforma_admins where user_id = (select auth.uid())
  );
$$;

-- ¿El usuario actual puede LEER datos de la clínica con alguno de estos roles?
create function app.puede_leer(p_clinica uuid, p_roles public.rol_equipo[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.membresias m
    join public.clinicas c on c.id = m.clinica_id
    where m.clinica_id = p_clinica
      and m.user_id = (select auth.uid())
      and m.activo
      and m.rol = any (p_roles)
      and (c.estado_suscripcion <> 'suspendida' or m.rol = 'admin_clinica')
  );
$$;

-- ¿El usuario actual puede ESCRIBIR datos de la clínica con alguno de estos roles?
create function app.puede_escribir(p_clinica uuid, p_roles public.rol_equipo[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.membresias m
    join public.clinicas c on c.id = m.clinica_id
    where m.clinica_id = p_clinica
      and m.user_id = (select auth.uid())
      and m.activo
      and m.rol = any (p_roles)
      and c.estado_suscripcion in ('activa', 'gracia')
  );
$$;

-- Fichas de profesional vinculadas al usuario actual (con membresía activa).
create function app.mis_profesional_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id
  from public.profesionales p
  join public.membresias m on m.clinica_id = p.clinica_id and m.user_id = p.user_id
  where p.user_id = (select auth.uid()) and p.activo and m.activo;
$$;

-- ¿El paciente es "de" algún profesional del usuario actual?
-- (profesional de referencia o tiene/tuvo turnos con él)
create function app.es_paciente_de_mis_profesionales(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pacientes pa
    where pa.id = p_paciente
      and pa.profesional_referencia_id in (select app.mis_profesional_ids())
  ) or exists (
    select 1 from public.turnos t
    where t.paciente_id = p_paciente
      and t.profesional_id in (select app.mis_profesional_ids())
  );
$$;

-- Fichas de paciente del usuario actual (acceso activo y clínica no suspendida).
create function app.mis_paciente_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pa.id
  from public.pacientes pa
  join public.clinicas c on c.id = pa.clinica_id
  where pa.user_id = (select auth.uid())
    and pa.estado_acceso = 'activo'
    and c.estado_suscripcion <> 'suspendida';
$$;

create function app.mis_clinicas_como_paciente() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pa.clinica_id
  from public.pacientes pa
  join public.clinicas c on c.id = pa.clinica_id
  where pa.user_id = (select auth.uid())
    and pa.estado_acceso = 'activo'
    and c.estado_suscripcion <> 'suspendida';
$$;

-- ¿Puede el equipo ver la ficha del paciente? (admin y recepción: todos; profesional: los suyos)
create function app.puede_ver_paciente(p_clinica uuid, p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_leer(p_clinica, array['admin_clinica', 'recepcion']::public.rol_equipo[])
      or (app.puede_leer(p_clinica, array['profesional']::public.rol_equipo[])
          and app.es_paciente_de_mis_profesionales(p_paciente));
$$;

-- ¿Puede ver notas clínicas / campos reservados a profesionales?
create function app.puede_ver_clinico(p_clinica uuid, p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.puede_leer(p_clinica, array['admin_clinica']::public.rol_equipo[])
      or (app.puede_leer(p_clinica, array['profesional']::public.rol_equipo[])
          and app.es_paciente_de_mis_profesionales(p_paciente));
$$;

-- ¿La sesión actual es de un cliente (no de un proceso privilegiado del servidor)?
-- Se usa en triggers NO security definer, donde current_user es el rol que invoca.
create function app.es_cliente() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('authenticated', 'anon');
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Permisos base
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- TRUNCATE, REFERENCES y TRIGGER no pasan por RLS: se quitan al cliente.
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- Tablas que el cliente nunca toca: solo el servidor (service_role).
revoke all on public.intentos_login from authenticated;
revoke insert, update, delete on public.auditoria from authenticated;
revoke insert, update, delete on public.invitaciones from authenticated;
revoke insert, update, delete on public.mensajes from authenticated;
revoke insert, update, delete on public.plataforma_admins from authenticated;
revoke update, delete on public.notas_clinicas from authenticated;

-- -----------------------------------------------------------------------------
-- RLS en todas las tablas
-- -----------------------------------------------------------------------------
alter table public.plataforma_admins enable row level security;
alter table public.clinicas enable row level security;
alter table public.membresias enable row level security;
alter table public.profesionales enable row level security;
alter table public.recursos enable row level security;
alter table public.servicios enable row level security;
alter table public.servicio_profesional enable row level security;
alter table public.horarios_profesional enable row level security;
alter table public.bloqueos_agenda enable row level security;
alter table public.pacientes enable row level security;
alter table public.campos_personalizados enable row level security;
alter table public.valores_campos enable row level security;
alter table public.notas_clinicas enable row level security;
alter table public.paquetes enable row level security;
alter table public.turnos enable row level security;
alter table public.plantillas_mensaje enable row level security;
alter table public.mensajes enable row level security;
alter table public.invitaciones enable row level security;
alter table public.avisos enable row level security;
alter table public.pagos_suscripcion enable row level security;
alter table public.auditoria enable row level security;
alter table public.intentos_login enable row level security;

-- Atajos de roles usados abajo:
--   todos    = admin_clinica, recepcion, profesional
--   gestion  = admin_clinica, recepcion

-- plataforma_admins: cada usuario puede saber si él mismo es superadmin.
create policy "ver propio registro" on public.plataforma_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- clinicas
create policy "superadmin o equipo ve la clinica" on public.clinicas
  for select to authenticated using (
    app.es_superadmin()
    or app.puede_leer(id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
  );
create policy "superadmin crea clinicas" on public.clinicas
  for insert to authenticated with check (app.es_superadmin());
create policy "superadmin o admin edita la clinica" on public.clinicas
  for update to authenticated
  using (app.es_superadmin() or app.puede_escribir(id, array['admin_clinica']::public.rol_equipo[]))
  with check (app.es_superadmin() or app.puede_escribir(id, array['admin_clinica']::public.rol_equipo[]));

-- membresias
create policy "ver equipo" on public.membresias
  for select to authenticated using (
    user_id = (select auth.uid())
    or app.es_superadmin()
    or app.puede_leer(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
  );
-- El alta se hace desde el servidor (hay que crear la identidad en Auth).
-- El admin puede cambiar rol/activo de otros miembros, nunca los suyos.
create policy "admin edita equipo" on public.membresias
  for update to authenticated
  using (app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[]) and user_id <> (select auth.uid()))
  with check (app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[]) and user_id <> (select auth.uid()));

-- Configuración: la ve todo el equipo, la edita el admin.
do $$
declare t text;
begin
  foreach t in array array['profesionales', 'recursos', 'servicios', 'servicio_profesional',
                           'horarios_profesional', 'campos_personalizados', 'plantillas_mensaje', 'avisos']
  loop
    execute format($f$
      create policy "equipo ve" on public.%1$I for select to authenticated using (
        app.puede_leer(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
      );
      create policy "admin crea" on public.%1$I for insert to authenticated with check (
        app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[])
      );
      create policy "admin edita" on public.%1$I for update to authenticated
        using (app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[]))
        with check (app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[]));
      create policy "admin borra" on public.%1$I for delete to authenticated using (
        app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[])
      );
    $f$, t);
  end loop;
end $$;

-- El paciente ve profesionales, servicios y avisos de su clínica (para su app).
create policy "paciente ve profesionales" on public.profesionales
  for select to authenticated using (clinica_id in (select app.mis_clinicas_como_paciente()));
create policy "paciente ve servicios" on public.servicios
  for select to authenticated using (clinica_id in (select app.mis_clinicas_como_paciente()));
create policy "paciente ve avisos vigentes" on public.avisos
  for select to authenticated using (
    clinica_id in (select app.mis_clinicas_como_paciente())
    and visible_desde <= now() and (visible_hasta is null or visible_hasta > now())
  );

-- bloqueos_agenda: los gestiona admin y recepción.
create policy "equipo ve bloqueos" on public.bloqueos_agenda
  for select to authenticated using (
    app.puede_leer(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
  );
create policy "gestion crea bloqueos" on public.bloqueos_agenda
  for insert to authenticated with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );
create policy "gestion edita bloqueos" on public.bloqueos_agenda
  for update to authenticated
  using (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]))
  with check (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]));
create policy "gestion borra bloqueos" on public.bloqueos_agenda
  for delete to authenticated using (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );

-- pacientes
create policy "equipo ve pacientes" on public.pacientes
  for select to authenticated using (app.puede_ver_paciente(clinica_id, id));
create policy "paciente ve su ficha" on public.pacientes
  for select to authenticated using (id in (select app.mis_paciente_ids()));
create policy "gestion crea pacientes" on public.pacientes
  for insert to authenticated with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );
create policy "gestion edita pacientes" on public.pacientes
  for update to authenticated
  using (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]))
  with check (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]));

-- valores_campos: los campos "solo profesionales" no los ve recepción.
create policy "equipo ve valores" on public.valores_campos
  for select to authenticated using (
    exists (
      select 1 from public.campos_personalizados c
      where c.id = valores_campos.campo_id
        and case c.visible_para
              when 'todos' then app.puede_ver_paciente(valores_campos.clinica_id, valores_campos.paciente_id)
              else app.puede_ver_clinico(valores_campos.clinica_id, valores_campos.paciente_id)
            end
    )
  );
create policy "equipo carga valores" on public.valores_campos
  for insert to authenticated with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
    and exists (
      select 1 from public.campos_personalizados c
      where c.id = valores_campos.campo_id
        and case c.visible_para
              when 'todos' then app.puede_ver_paciente(valores_campos.clinica_id, valores_campos.paciente_id)
              else app.puede_ver_clinico(valores_campos.clinica_id, valores_campos.paciente_id)
            end
    )
  );
create policy "equipo edita valores" on public.valores_campos
  for update to authenticated
  using (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
    and exists (
      select 1 from public.campos_personalizados c
      where c.id = valores_campos.campo_id
        and case c.visible_para
              when 'todos' then app.puede_ver_paciente(valores_campos.clinica_id, valores_campos.paciente_id)
              else app.puede_ver_clinico(valores_campos.clinica_id, valores_campos.paciente_id)
            end
    )
  )
  with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[])
    and exists (
      select 1 from public.campos_personalizados c
      where c.id = valores_campos.campo_id
        and case c.visible_para
              when 'todos' then app.puede_ver_paciente(valores_campos.clinica_id, valores_campos.paciente_id)
              else app.puede_ver_clinico(valores_campos.clinica_id, valores_campos.paciente_id)
            end
    )
  );

-- notas_clinicas: solo admin y profesional (de sus pacientes). Nunca recepción.
create policy "ver notas clinicas" on public.notas_clinicas
  for select to authenticated using (app.puede_ver_clinico(clinica_id, paciente_id));
create policy "profesional escribe notas" on public.notas_clinicas
  for insert to authenticated with check (
    profesional_id in (select app.mis_profesional_ids())
    and (
      app.puede_escribir(clinica_id, array['admin_clinica']::public.rol_equipo[])
      or (app.puede_escribir(clinica_id, array['profesional']::public.rol_equipo[])
          and app.es_paciente_de_mis_profesionales(paciente_id))
    )
  );

-- paquetes
create policy "equipo ve paquetes" on public.paquetes
  for select to authenticated using (app.puede_ver_paciente(clinica_id, paciente_id));
create policy "paciente ve sus paquetes" on public.paquetes
  for select to authenticated using (paciente_id in (select app.mis_paciente_ids()));
create policy "gestion crea paquetes" on public.paquetes
  for insert to authenticated with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );
create policy "gestion edita paquetes" on public.paquetes
  for update to authenticated
  using (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]))
  with check (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]));

-- turnos. El paciente NO lee la tabla directo (tiene notas_internas): usará una
-- función dedicada en la fase 3.
create policy "gestion ve turnos" on public.turnos
  for select to authenticated using (
    app.puede_leer(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );
create policy "profesional ve su agenda" on public.turnos
  for select to authenticated using (
    app.puede_leer(clinica_id, array['profesional']::public.rol_equipo[])
    and profesional_id in (select app.mis_profesional_ids())
  );
create policy "gestion crea turnos" on public.turnos
  for insert to authenticated with check (
    app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );
create policy "gestion edita turnos" on public.turnos
  for update to authenticated
  using (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]))
  with check (app.puede_escribir(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[]));
create policy "profesional edita sus turnos" on public.turnos
  for update to authenticated
  using (
    app.puede_escribir(clinica_id, array['profesional']::public.rol_equipo[])
    and profesional_id in (select app.mis_profesional_ids())
  )
  with check (
    app.puede_escribir(clinica_id, array['profesional']::public.rol_equipo[])
    and profesional_id in (select app.mis_profesional_ids())
  );

-- mensajes: el historial lo ve admin y recepción. Los crea el servidor.
create policy "gestion ve mensajes" on public.mensajes
  for select to authenticated using (
    app.puede_leer(clinica_id, array['admin_clinica', 'recepcion']::public.rol_equipo[])
  );

-- invitaciones: estado visible para quien puede reenviarlas. Las crea el servidor.
create policy "ver invitaciones" on public.invitaciones
  for select to authenticated using (
    app.puede_leer(clinica_id, array['admin_clinica']::public.rol_equipo[])
    or (paciente_id is not null
        and app.puede_leer(clinica_id, array['recepcion']::public.rol_equipo[]))
  );

-- pagos_suscripcion
create policy "superadmin o admin ve pagos" on public.pagos_suscripcion
  for select to authenticated using (
    app.es_superadmin() or app.puede_leer(clinica_id, array['admin_clinica']::public.rol_equipo[])
  );
create policy "superadmin registra pagos" on public.pagos_suscripcion
  for insert to authenticated with check (app.es_superadmin());

-- auditoria: el admin ve la de su clínica; el superadmin la de plataforma.
create policy "ver auditoria" on public.auditoria
  for select to authenticated using (
    app.puede_leer(clinica_id, array['admin_clinica']::public.rol_equipo[])
    or (clinica_id is null and app.es_superadmin())
  );

-- intentos_login: sin políticas → inaccesible para clientes.

-- -----------------------------------------------------------------------------
-- Protecciones de columnas (triggers)
-- -----------------------------------------------------------------------------

-- Ningún registro puede cambiar de clínica.
create function app.bloquear_cambio_clinica() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.clinica_id is distinct from old.clinica_id then
    raise exception 'No se puede cambiar la clínica de un registro' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['membresias', 'profesionales', 'recursos', 'servicios', 'servicio_profesional',
                           'horarios_profesional', 'bloqueos_agenda', 'pacientes', 'campos_personalizados',
                           'valores_campos', 'notas_clinicas', 'paquetes', 'turnos', 'plantillas_mensaje',
                           'mensajes', 'invitaciones', 'avisos', 'pagos_suscripcion']
  loop
    execute format(
      'create trigger bloquear_cambio_clinica before update on public.%I
         for each row execute function app.bloquear_cambio_clinica()', t);
  end loop;
end $$;

-- clinicas: el admin de la clínica no puede tocar datos de suscripción.
create function app.proteger_clinica() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.es_cliente() and not app.es_superadmin() then
    if new.estado_suscripcion is distinct from old.estado_suscripcion
       or new.plan is distinct from old.plan
       or new.precio_mensual is distinct from old.precio_mensual
       or new.fecha_proximo_cobro is distinct from old.fecha_proximo_cobro
       or new.dias_gracia is distinct from old.dias_gracia
       or new.dias_hasta_suspension is distinct from old.dias_hasta_suspension
       or new.slug is distinct from old.slug
       or new.creada_en is distinct from old.creada_en then
      raise exception 'Solo el proveedor puede modificar estos datos de la clínica' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger proteger_clinica before update on public.clinicas
  for each row execute function app.proteger_clinica();

-- membresias: user_id no cambia nunca.
create function app.proteger_membresia() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el usuario de una membresía' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger proteger_membresia before update on public.membresias
  for each row execute function app.proteger_membresia();

-- pacientes: la vinculación con la identidad de Auth la hace solo el servidor
-- (al activar la cuenta). Un cliente no puede asignar ni cambiar user_id,
-- ni marcar un acceso como activo sin identidad.
create function app.proteger_paciente() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.es_cliente() then
    if tg_op = 'INSERT' then
      if new.user_id is not null or new.estado_acceso <> 'invitado' then
        raise exception 'El acceso del paciente se crea por invitación' using errcode = '42501';
      end if;
      new.creado_por := auth.uid();
      new.creado_en := now();
    else
      if new.user_id is distinct from old.user_id
         or new.creado_por is distinct from old.creado_por
         or new.creado_en is distinct from old.creado_en then
        raise exception 'Campo no modificable' using errcode = '42501';
      end if;
      -- Desde el panel solo se puede desactivar o reactivar un acceso ya creado.
      if new.estado_acceso is distinct from old.estado_acceso
         and (new.user_id is null or new.estado_acceso = 'invitado') then
        raise exception 'Cambio de estado de acceso no permitido' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger proteger_paciente before insert or update on public.pacientes
  for each row execute function app.proteger_paciente();

-- profesionales: solo se puede vincular a un usuario que sea miembro de la misma clínica.
create function app.validar_profesional() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.membresias m
    where m.clinica_id = new.clinica_id and m.user_id = new.user_id
  ) then
    raise exception 'El usuario vinculado debe pertenecer al equipo de la clínica' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger validar_profesional before insert or update of user_id on public.profesionales
  for each row execute function app.validar_profesional();

-- turnos / pagos: autoría fijada por el servidor.
create function app.fijar_autor() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.es_cliente() then
    if tg_op = 'INSERT' then
      if tg_table_name = 'turnos' then new.creado_por := auth.uid(); new.creado_en := now(); end if;
      if tg_table_name = 'pagos_suscripcion' then new.registrado_por := auth.uid(); new.creado_en := now(); end if;
    elsif tg_table_name = 'turnos' then
      new.creado_por := old.creado_por;
      new.creado_en := old.creado_en;
    end if;
  end if;
  return new;
end $$;
create trigger fijar_autor before insert or update on public.turnos
  for each row execute function app.fijar_autor();
create trigger fijar_autor before insert on public.pagos_suscripcion
  for each row execute function app.fijar_autor();

create function app.fijar_nota() returns trigger
language plpgsql set search_path = '' as $$
begin
  if app.es_cliente() then new.creada_en := now(); end if;
  return new;
end $$;
create trigger fijar_nota before insert on public.notas_clinicas
  for each row execute function app.fijar_nota();

-- -----------------------------------------------------------------------------
-- Sesiones: desactivar a alguien invalida sus sesiones
-- -----------------------------------------------------------------------------
create function app.cerrar_sesiones(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user;
end $$;
revoke all on function app.cerrar_sesiones(uuid) from public, authenticated;

create function app.al_desactivar_membresia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.activo and not new.activo then
    -- Sin otras membresías activas ni superadmin → se cierran todas sus sesiones.
    -- (Con otras, RLS ya le quita el acceso a esta clínica al instante.)
    if not exists (
      select 1 from public.membresias m
      where m.user_id = new.user_id and m.activo and m.id <> new.id
    ) and not exists (
      select 1 from public.plataforma_admins a where a.user_id = new.user_id
    ) then
      perform app.cerrar_sesiones(new.user_id);
    end if;
  end if;
  return new;
end $$;
create trigger al_desactivar_membresia after update of activo on public.membresias
  for each row execute function app.al_desactivar_membresia();

create function app.al_desactivar_paciente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and old.estado_acceso = 'activo' and new.estado_acceso = 'desactivado' then
    -- Cada cuenta de paciente es exclusiva de una clínica.
    perform app.cerrar_sesiones(new.user_id);
  end if;
  return new;
end $$;
create trigger al_desactivar_paciente after update of estado_acceso on public.pacientes
  for each row execute function app.al_desactivar_paciente();

-- -----------------------------------------------------------------------------
-- Auditoría automática de cambios
-- Solo guarda QUÉ columnas cambiaron, nunca los valores (no duplicar datos sensibles).
-- -----------------------------------------------------------------------------
create function app.ip_actual() returns text
language sql stable set search_path = '' as $$
  select split_part(
    coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''),
    ',', 1)
$$;

create function app.auditar_cambio() returns trigger
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
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'paciente_id'),
    case when v_cols is not null then jsonb_build_object('columnas', v_cols) end,
    nullif(app.ip_actual(), '')
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clinicas', 'membresias', 'pacientes', 'valores_campos', 'notas_clinicas',
                           'invitaciones', 'pagos_suscripcion', 'plataforma_admins']
  loop
    execute format(
      'create trigger auditar after insert or update or delete on public.%I
         for each row execute function app.auditar_cambio()', t);
  end loop;
end $$;

-- Registro explícito de accesos (ver ficha, exportar, etc.) desde la aplicación.
create function public.registrar_acceso(p_clinica uuid, p_accion text, p_entidad text, p_entidad_id text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.puede_leer(p_clinica, array['admin_clinica', 'recepcion', 'profesional']::public.rol_equipo[]) then
    raise exception 'Sin acceso a la clínica' using errcode = '42501';
  end if;
  if p_accion not in ('ver', 'exportar') then
    raise exception 'Acción no válida' using errcode = '22023';
  end if;
  insert into public.auditoria (clinica_id, user_id, accion, entidad, entidad_id, ip)
  values (p_clinica, auth.uid(), p_accion, left(p_entidad, 60), left(p_entidad_id, 80), nullif(app.ip_actual(), ''));
end $$;
revoke all on function public.registrar_acceso(uuid, text, text, text) from public, anon;
grant execute on function public.registrar_acceso(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Funciones solo para el servidor (service_role)
-- -----------------------------------------------------------------------------

-- Busca una identidad de Auth por email (para sumar a alguien que ya existe a otra clínica).
create function public.srv_usuario_por_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.srv_usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.srv_usuario_por_email(text) to service_role;

create function public.srv_cerrar_sesiones(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  select app.cerrar_sesiones(p_user);
$$;
revoke all on function public.srv_cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.srv_cerrar_sesiones(uuid) to service_role;
