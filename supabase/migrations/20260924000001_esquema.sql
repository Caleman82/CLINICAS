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
