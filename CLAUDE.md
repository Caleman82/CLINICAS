@AGENTS.md

# Sistema de gestión para clínicas — estado del proyecto

Software multi-clínica (turnos, pacientes, recordatorios, app del paciente) de Caleman Creativa.
Primer cliente: CEMER. Nombre del producto: **a definir**.

- Texto visible: español de Uruguay (voseo). Zona horaria `America/Montevideo`. Moneda UYU.
- Se trabaja **por fases** (sección 11 de la especificación). No avanzar sin confirmación.
- Ante decisiones no definidas en la especificación: **preguntar** antes de asumir.

## Estado

| Fase | Estado |
|---|---|
| 1 — Base y seguridad | **Hecha, a la espera de confirmación** |
| 2 — Pacientes y agenda | Pendiente (el esquema, la RLS y la regla de superposición ya están) |
| 3 — Invitaciones de pacientes y PWA | Pendiente |
| 4 — Recordatorios | Pendiente |
| 5 — Suscripciones y bloqueo | Pendiente (la RLS ya aplica los estados; falta cron, pagos y exportación) |
| 6 — Configuración avanzada y pulido | Pendiente |

### Qué incluye la fase 1
- Esquema completo de la sección 5 con claves foráneas compuestas `(id, clinica_id)`: es imposible vincular registros de clínicas distintas.
- RLS en todas las tablas, basada en membresía + rol, y en `paciente_id` para pacientes.
- Estados de suscripción aplicados en la base (`solo_lectura` no escribe; `suspendida` solo deja leer al admin).
- Regla de agenda en la base: `EXCLUDE USING gist` por profesional y por recurso (los cancelados no ocupan lugar).
- Protecciones por trigger: nadie mueve registros entre clínicas; el admin no toca datos de suscripción; recepción no puede vincular una ficha a una identidad; autoría fijada por el servidor.
- Auditoría automática (qué columnas cambiaron, nunca los valores) + `registrar_acceso()` para lecturas/exportaciones.
- Desactivar un miembro o un paciente corta el acceso al instante (RLS) y cierra sus sesiones.
- Login del equipo (email + clave) con límite de intentos (5 fallos por usuario o 20 por IP en 15 min).
- Invitaciones del equipo: enlace de un solo uso, 72 h, hash SHA-256 en la base, cada reenvío invalida el anterior.
- Panel del proveedor: listado de clínicas, alta de clínica + primer admin, agregar admins, generar enlaces.
- Panel de la clínica: estructura, avisos de gracia/solo lectura, pantalla de acceso pausado, gestión del equipo.
- 48 tests (Vitest + Postgres) de aislamiento, roles, suscripción, agenda y auditoría. CI en GitHub Actions.

## Cómo correrlo localmente

Requisitos: Node 22, Postgres 16+ (para los tests) y, para la app, un proyecto Supabase (local con `npx supabase start`, que usa Docker, o uno de desarrollo en la nube).

```bash
npm install
cp .env.example .env.local          # completar valores

# Tests de base de datos (crean y borran la base clinicas_test en el Postgres de TEST_DATABASE_ADMIN_URL)
npm test

# Base local de Supabase + migraciones
npx supabase start
npx supabase db reset                 # aplica supabase/migrations

# Primer superadmin (pide la clave por consola)
SUPERADMIN_EMAIL=vos@calemancreativa.com npm run crear-superadmin

npm run dev                           # http://localhost:3000
```

Otros comandos: `npm run lint`, `npm run typecheck`, `npm run build`.

## Estructura

- `supabase/migrations/` — esquema, RLS, triggers, funciones. **Toda tabla nueva necesita RLS** (hay un test que falla si no).
- `supabase/tests/supabase_shim.sql` — roles y esquema `auth` mínimos para correr los tests sobre Postgres común.
- `tests/db/` — fixture con dos clínicas completas y tests. `como(db, usuario, fn)` ejecuta como lo haría PostgREST.
- `src/lib/supabase/` — `server.ts` (con sesión, pasa por RLS) y `admin.ts` (service_role, **solo servidor**, importa `server-only`).
- `src/lib/invitaciones.ts` — alta de miembros y enlaces de activación.
- `src/lib/sesion.ts` — contexto del usuario (`mis_clinicas()`), guardas `exigirSuperadmin` / `exigirClinica`.
- `src/app/` — `ingresar`, `activar/[token]`, `proveedor/…`, `c/[slug]/…` (panel de la clínica).
- `docs/produccion.md` — configuración de Supabase/Vercel, backups y restauración, checklist de seguridad.

## Decisiones tomadas (fase 1)

1. **Un solo proyecto Next.js** para panel, proveedor y (en fase 3) la PWA del paciente, en rutas separadas. A confirmar antes de la fase 3.
2. **El equipo ingresa con email** (no "usuario" como en el prototipo). Los pacientes usarán cédula (fase 3).
3. `membresias` tiene además `nombre` y `email` (auth.users no es legible desde el cliente). Cambio de estructura respecto de la sección 5.
4. Otras columnas agregadas: `creado_en` en turnos/mensajes/invitaciones/pagos, `creado_por` en invitaciones. Tablas nuevas: `plataforma_admins` (superadmins) e `intentos_login` (límite de intentos).
5. `dia_semana`: 1 = lunes … 7 = domingo. `periodo` de pagos = primer día del mes.
6. **Profesional ve solo "sus" pacientes** (profesional de referencia o con turnos con él), su agenda y las notas de esos pacientes. Admin ve todo. Recepción no ve notas ni campos "solo profesionales".
7. **Notas clínicas**: solo se agregan, no se editan ni borran. Las escribe un profesional (o un admin que tenga ficha de profesional vinculada).
8. **El paciente no lee la tabla `turnos`** (tiene `notas_internas`); en la fase 3 se le dará una función dedicada.
9. **Suspendida**: solo el admin conserva lectura (para exportar). En `solo_lectura` no se permite ninguna escritura, tampoco de configuración.
10. Enlaces de clave del equipo: el admin de una clínica **no** puede generarlos para alguien que también trabaje en otra clínica (evita tomar cuentas ajenas); eso lo hace el proveedor. Si se invita a alguien que ya tiene cuenta, solo se agrega la membresía.
11. El admin no puede modificar su propia membresía (evita autobloqueo).
12. Hasta tener email/WhatsApp (fases 3–4) los enlaces se muestran para **copiar y enviar a mano**.
13. Autoría en auditoría para operaciones del servidor: header `x-actor-id`, aceptado solo con JWT de service_role.

## Pendientes de definir (sección 13 y otros)

- Nombre del producto y dominio.
- Planes y precios.
- Rubro y servicios de CEMER.
- Días de gracia/suspensión por defecto (se usaron 7 y 15).
- 2FA: la especificación la pide obligatoria para superadmin, pero la ubica en la fase 6. Se sugiere adelantarla antes de usar el panel del proveedor en producción.
- IP real del cliente en la auditoría (hoy PostgREST ve la IP del servidor de Next).
