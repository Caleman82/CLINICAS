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
| 1 — Base y seguridad | Hecha y confirmada |
| 2 — Pacientes y agenda | **Hecha, a la espera de confirmación** (+ cancelación por el paciente con plazo por clínica) |
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

### Qué incluye la fase 2
- **Configuración (admin)**: profesionales (color, especialidad, usuario vinculado, activo), qué servicios realiza cada uno, horarios de atención por día; servicios (duración, precio, recurso requerido, indicaciones previas); recursos con tipo.
- **Pacientes**: alta con consentimiento obligatorio (Ley 18.331, se guarda fecha y hora), cédula validada con dígito verificador, búsqueda por nombre (sin tildes, palabras en cualquier orden), cédula o celular. Ficha con datos, acceso a la app (desactivar/reactivar), paquetes con progreso, datos adicionales (campos personalizados, si hay), turnos próximos e historial, mensajes, notas clínicas (solo admin y profesional). Abrir una ficha queda en la auditoría.
- **Agenda**: vista día (columnas por profesional) y semana (un profesional), filtros por profesional y recurso, horario de atención sombreado, bloqueos rayados, línea de hora actual, clic en un hueco para agendar.
- **Turnos**: al elegir el servicio se sugiere la duración y se filtran profesionales y recursos; asignación automática de un recurso libre del tipo requerido; control de horario de atención (se puede forzar con una casilla); mover/modificar; estados (confirmar, en sala, atendido, no asistió, cancelar).
- **Reglas en la base** (trigger `validar_turno`): profesional y servicio activos, el profesional realiza el servicio, recurso del tipo requerido, bloqueos, paquete del mismo servicio, vigente y con sesiones. El descuento de sesiones al marcar "atendido" (y la devolución si se corrige) lo hace la base; `sesiones_usadas` no se edita a mano.
- **Bloqueos de agenda** (admin y recepción): por profesional o por recurso; avisa si ya había turnos en ese período.
- 86 tests: 72 de base (RLS, agenda, paquetes, búsqueda, cancelación por el paciente) + 14 unitarios (zona horaria, grilla, cédula, estados).

### Cancelación de turnos por el paciente (pedido agregado)
- Cada clínica elige el plazo en Configuración → Cancelaciones: 24, 48 (por defecto) o 72 horas antes del turno (`clinicas.horas_limite_cancelacion`).
- La regla está en la base: `cancelar_mi_turno(turno)` solo cancela turnos propios, agendados/confirmados/con pedido de reprogramación, con la clínica activa o en gracia y dentro del plazo. Fuera de plazo devuelve: "Estás fuera de las horas posibles para cancelar. Los turnos se pueden cancelar hasta N horas antes. Comunicate con la clínica".
- `mis_turnos()` le da a la app del paciente sus turnos (sin notas internas) con `puede_cancelar` y `cancelable_hasta`, para mostrar el botón bloqueado. **El botón en la app se construye en la fase 3.**
- Recepción ve en la agenda un aviso con los turnos cancelados por pacientes, y en el turno/ficha si lo canceló el paciente y hasta cuándo puede hacerlo.
- Columnas nuevas en `turnos`: `cancelado_en`, `cancelado_por_paciente` (este último solo lo puede marcar la función del paciente).

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
- `src/lib/sesion.ts` — contexto del usuario (`mis_clinicas()`), guardas `exigirSuperadmin` / `exigirClinica`, `autorizarEscritura` para Server Actions.
- `src/lib/fechas.ts` — conversión hora local ↔ instante, calendario y cálculo de la grilla (con tests en `tests/unit`).
- `src/lib/errores.ts` — traduce errores de la base (superposición, reglas, RLS) a mensajes para el usuario.
- `src/components/formulario.tsx` — `Formulario` y `BotonAccion` para Server Actions (no vacía los campos si hay error).
- `src/app/` — `ingresar`, `activar/[token]`, `proveedor/…`, `c/[slug]/…` (panel de la clínica: agenda en `page.tsx` + `_agenda/`, `pacientes/`, `turnos/`, `bloqueos/`, `equipo/`, `configuracion/`).
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

## Decisiones tomadas (fase 2)

14. **Cédula validada con dígito verificador** (formato uruguayo). Un paciente extranjero sin cédula no se puede cargar todavía: a definir si se admite documento alternativo.
15. **Horario de atención**: si el profesional tiene horarios cargados, un turno fuera de ellos requiere marcar "Agendar fuera del horario". Si no tiene horarios, no se controla.
16. **Servicio ↔ profesional**: si un servicio no tiene profesionales asignados, lo puede hacer cualquiera.
17. **Recurso**: si el servicio requiere un tipo de recurso y no se elige uno, se asigna el primero libre de ese tipo.
18. **Turnos cancelados** no ocupan lugar y no se muestran en la grilla (sí en la ficha del paciente). Los "no asistió" sí ocupan su lugar.
19. **Solo se mueven** turnos agendados, confirmados o con pedido de reprogramación. El profesional puede cambiar el estado de sus turnos (confirmar, en sala, atendido, no asistió) pero no cancelarlos ni moverlos; eso es de recepción.
20. Un bloqueo nuevo **no cancela** los turnos que ya había en ese período: avisa cuántos hay para revisarlos.
21. La zona horaria usada es `America/Montevideo` para todas las clínicas (el campo `zona_horaria` existe pero todavía no se usa en la interfaz).

## Pendientes de definir (sección 13 y otros)

- Nombre del producto y dominio.
- Planes y precios.
- Rubro y servicios de CEMER.
- Días de gracia/suspensión por defecto (se usaron 7 y 15).
- 2FA: la especificación la pide obligatoria para superadmin, pero la ubica en la fase 6. Se sugiere adelantarla antes de usar el panel del proveedor en producción.
- IP real del cliente en la auditoría (hoy PostgREST ve la IP del servidor de Next).
