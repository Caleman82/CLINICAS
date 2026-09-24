-- =============================================================================
-- INSTALACIÓN COMPLETA DE LA BASE (todas las migraciones juntas, en orden).
-- Para pegar UNA sola vez en el SQL Editor de un proyecto Supabase NUEVO.
-- Archivo generado con scripts/unir-migraciones.sh: no editar a mano.
-- =============================================================================

-- ----- 20260924000001_esquema.sql -----
-- =============================================================================
-- Esquema inicial — sistema de gestión multi-clínica
-- Todas las tablas operativas llevan clinica_id. Las referencias entre tablas
-- usan claves foráneas compuestas (id, clinica_id) para que sea IMPOSIBLE, a
-- nivel de base, vincular un registro con otro de una clínica distinta.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- Esquema interno para funciones auxiliares (no se expone por la API REST).
create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.estado_suscripcion as enum ('activa', 'gracia', 'solo_lectura', 'suspendida');
create type public.rol_equipo as enum ('admin_clinica', 'recepcion', 'profesional');
create type public.estado_acceso as enum ('invitado', 'activo', 'desactivado');
create type public.tipo_campo as enum ('texto', 'numero', 'opcion', 'fecha', 'si_no');
create type public.visibilidad_campo as enum ('todos', 'profesionales');
create type public.estado_turno as enum (
  'agendado', 'confirmado', 'en_sala', 'atendido', 'cancelado', 'no_asistio', 'reprogramar_solicitado'
);
create type public.canal_mensaje as enum ('whatsapp', 'email');
create type public.tipo_plantilla as enum (
  'invitacion', 'recordatorio', 'indicaciones', 'cancelacion', 'reprogramacion'
);
create type public.estado_mensaje as enum (
  'programado', 'enviado', 'entregado', 'leido', 'fallido', 'respondido'
);
create type public.canal_invitacion as enum ('whatsapp', 'email', 'enlace');

-- -----------------------------------------------------------------------------
-- Plataforma
-- -----------------------------------------------------------------------------

-- Usuarios de Caleman Creativa con rol superadmin.
create table public.plataforma_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table public.clinicas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  rubro text,
  logo_url text,
  color_primario text not null default '#1F6F6B' check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  telefono_contacto text,
  direccion text,
  zona_horaria text not null default 'America/Montevideo',
  estado_suscripcion public.estado_suscripcion not null default 'activa',
  plan text,
  precio_mensual numeric(12, 2) check (precio_mensual is null or precio_mensual >= 0),
  fecha_proximo_cobro date,
  dias_gracia integer not null default 7 check (dias_gracia >= 0),
  dias_hasta_suspension integer not null default 15 check (dias_hasta_suspension > dias_gracia),
  creada_en timestamptz not null default now()
);

-- Equipo de cada clínica. Un usuario puede pertenecer a varias clínicas, con un rol por clínica.
-- nombre y email se guardan acá porque auth.users no es legible desde el cliente.
create table public.membresias (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_equipo not null,
  activo boolean not null default true,
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  email text not null,
  creado_en timestamptz not null default now(),
  unique (clinica_id, user_id),
  unique (id, clinica_id)
);
create index on public.membresias (user_id);

-- -----------------------------------------------------------------------------
-- Configuración de la clínica
-- -----------------------------------------------------------------------------
create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  user_id uuid references auth.users (id) on delete set null,
  nombre_visible text not null check (length(trim(nombre_visible)) between 2 and 120),
  especialidad text,
  color_agenda text not null default '#1F6F6B' check (color_agenda ~ '^#[0-9A-Fa-f]{6}$'),
  activo boolean not null default true,
  unique (id, clinica_id),
  unique (clinica_id, user_id)
);

create table public.recursos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  tipo text not null check (length(trim(tipo)) between 1 and 60),
  activo boolean not null default true,
  unique (id, clinica_id)
);

create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  duracion_min integer not null check (duracion_min between 5 and 720),
  precio numeric(12, 2) check (precio is null or precio >= 0),
  requiere_recurso_tipo text,
  indicaciones_previas text,
  activo boolean not null default true,
  unique (id, clinica_id)
);

create table public.servicio_profesional (
  clinica_id uuid not null references public.clinicas (id),
  servicio_id uuid not null,
  profesional_id uuid not null,
  primary key (servicio_id, profesional_id),
  foreign key (servicio_id, clinica_id) references public.servicios (id, clinica_id) on delete cascade,
  foreign key (profesional_id, clinica_id) references public.profesionales (id, clinica_id) on delete cascade
);

-- dia_semana: 1 = lunes … 7 = domingo (ISO 8601).
create table public.horarios_profesional (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  profesional_id uuid not null,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  hora_inicio time not null,
  hora_fin time not null check (hora_fin > hora_inicio),
  foreign key (profesional_id, clinica_id) references public.profesionales (id, clinica_id) on delete cascade
);

create table public.bloqueos_agenda (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  profesional_id uuid,
  recurso_id uuid,
  desde timestamptz not null,
  hasta timestamptz not null check (hasta > desde),
  motivo text,
  check (num_nonnulls(profesional_id, recurso_id) = 1),
  foreign key (profesional_id, clinica_id) references public.profesionales (id, clinica_id) on delete cascade,
  foreign key (recurso_id, clinica_id) references public.recursos (id, clinica_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Pacientes
-- -----------------------------------------------------------------------------
create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  user_id uuid references auth.users (id) on delete set null,
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  apellido text not null check (length(trim(apellido)) between 1 and 80),
  -- Cédula sin puntos ni guión.
  cedula text not null check (cedula ~ '^[0-9]{6,8}$'),
  fecha_nacimiento date,
  celular text,
  email text,
  profesional_referencia_id uuid,
  -- Sin consentimiento registrado no se puede crear el paciente.
  consentimiento_registrado boolean not null check (consentimiento_registrado),
  consentimiento_fecha timestamptz not null,
  estado_acceso public.estado_acceso not null default 'invitado',
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (clinica_id, cedula),
  unique (clinica_id, user_id),
  unique (id, clinica_id),
  foreign key (profesional_referencia_id, clinica_id) references public.profesionales (id, clinica_id)
);

create table public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  tipo public.tipo_campo not null,
  opciones jsonb check (opciones is null or jsonb_typeof(opciones) = 'array'),
  orden integer not null default 0,
  visible_para public.visibilidad_campo not null default 'todos',
  unique (id, clinica_id)
);

create table public.valores_campos (
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid not null,
  campo_id uuid not null,
  valor text,
  primary key (paciente_id, campo_id),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id) on delete cascade,
  foreign key (campo_id, clinica_id) references public.campos_personalizados (id, clinica_id) on delete cascade
);

-- Notas clínicas: solo profesional y admin_clinica. Son de solo agregado (no se editan ni borran).
create table public.notas_clinicas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid not null,
  profesional_id uuid not null,
  texto text not null check (length(trim(texto)) > 0),
  creada_en timestamptz not null default now(),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id),
  foreign key (profesional_id, clinica_id) references public.profesionales (id, clinica_id)
);
create index on public.notas_clinicas (paciente_id);

-- -----------------------------------------------------------------------------
-- Agenda
-- -----------------------------------------------------------------------------
create table public.paquetes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid not null,
  servicio_id uuid not null,
  sesiones_totales integer not null check (sesiones_totales > 0),
  sesiones_usadas integer not null default 0 check (sesiones_usadas >= 0),
  vence_en date,
  check (sesiones_usadas <= sesiones_totales),
  unique (id, clinica_id),
  unique (id, paciente_id),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id),
  foreign key (servicio_id, clinica_id) references public.servicios (id, clinica_id)
);

create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid not null,
  profesional_id uuid not null,
  recurso_id uuid,
  servicio_id uuid not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  estado public.estado_turno not null default 'agendado',
  paquete_id uuid,
  notas_internas text,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  check (fin > inicio),
  unique (id, clinica_id),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id),
  foreign key (profesional_id, clinica_id) references public.profesionales (id, clinica_id),
  foreign key (recurso_id, clinica_id) references public.recursos (id, clinica_id),
  foreign key (servicio_id, clinica_id) references public.servicios (id, clinica_id),
  foreign key (paquete_id, paciente_id) references public.paquetes (id, paciente_id),
  -- Regla de agenda: sin superposición del mismo profesional ni del mismo recurso.
  -- Los turnos cancelados no ocupan lugar.
  constraint turnos_sin_superposicion_profesional exclude using gist (
    profesional_id with =, tstzrange(inicio, fin, '[)') with &&
  ) where (estado <> 'cancelado'),
  constraint turnos_sin_superposicion_recurso exclude using gist (
    recurso_id with =, tstzrange(inicio, fin, '[)') with &&
  ) where (estado <> 'cancelado' and recurso_id is not null)
);
create index on public.turnos (clinica_id, inicio);
create index on public.turnos (paciente_id);

-- -----------------------------------------------------------------------------
-- Mensajería
-- -----------------------------------------------------------------------------
create table public.plantillas_mensaje (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  tipo public.tipo_plantilla not null,
  canal public.canal_mensaje not null,
  texto text not null,
  horas_antes integer check (horas_antes is null or horas_antes > 0),
  activa boolean not null default true,
  unique (id, clinica_id)
);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid not null,
  turno_id uuid,
  canal public.canal_mensaje not null,
  plantilla_id uuid,
  estado public.estado_mensaje not null default 'programado',
  respuesta text,
  enviado_en timestamptz,
  creado_en timestamptz not null default now(),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id),
  foreign key (turno_id, clinica_id) references public.turnos (id, clinica_id),
  foreign key (plantilla_id, clinica_id) references public.plantillas_mensaje (id, clinica_id)
);

-- Invitaciones de un solo uso. Se guarda solo el hash SHA-256 del token.
create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  paciente_id uuid,
  membresia_id uuid,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  vence_en timestamptz not null,
  usada_en timestamptz,
  canal public.canal_invitacion not null default 'enlace',
  creado_por uuid,
  creado_en timestamptz not null default now(),
  check (num_nonnulls(paciente_id, membresia_id) = 1),
  foreign key (paciente_id, clinica_id) references public.pacientes (id, clinica_id) on delete cascade,
  foreign key (membresia_id, clinica_id) references public.membresias (id, clinica_id) on delete cascade
);

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  texto text not null,
  visible_desde timestamptz not null default now(),
  visible_hasta timestamptz,
  check (visible_hasta is null or visible_hasta > visible_desde)
);

-- -----------------------------------------------------------------------------
-- Suscripción, auditoría y seguridad
-- -----------------------------------------------------------------------------
create table public.pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id),
  monto numeric(12, 2) not null check (monto > 0),
  periodo date not null, -- primer día del mes pagado
  fecha_pago date not null,
  registrado_por uuid default auth.uid(),
  medio text,
  creado_en timestamptz not null default now()
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  clinica_id uuid references public.clinicas (id),
  user_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb,
  ip text,
  creado_en timestamptz not null default now()
);
create index on public.auditoria (clinica_id, creado_en desc);

-- Intentos de ingreso, para limitar fuerza bruta. Solo accesible con service_role.
create table public.intentos_login (
  id bigint generated always as identity primary key,
  identificador text not null,
  ip text,
  exito boolean not null,
  creado_en timestamptz not null default now()
);
create index on public.intentos_login (identificador, creado_en desc);
create index on public.intentos_login (ip, creado_en desc);

-- ----- 20260924000002_seguridad.sql -----
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

-- ----- 20260924000003_funciones_app.sql -----
-- Clínicas del usuario actual (como miembro del equipo), con su rol y estado de suscripción.
-- Security definer: el estado se informa aunque la clínica esté suspendida (para mostrar
-- la pantalla de acceso pausado), pero solo campos no sensibles.
create function public.mis_clinicas()
returns table (
  clinica_id uuid,
  nombre text,
  slug text,
  color_primario text,
  estado_suscripcion public.estado_suscripcion,
  rol public.rol_equipo
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.nombre, c.slug, c.color_primario, c.estado_suscripcion, m.rol
  from public.membresias m
  join public.clinicas c on c.id = m.clinica_id
  where m.user_id = (select auth.uid()) and m.activo
  order by c.nombre;
$$;
revoke all on function public.mis_clinicas() from public, anon;
grant execute on function public.mis_clinicas() to authenticated;

-- ----- 20260924000004_autor_auditoria.sql -----
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

-- ----- 20260925000001_agenda.sql -----
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

-- ----- 20260926000001_cancelacion_paciente.sql -----
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

-- ----- 20260927000001_app_paciente.sql -----
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
