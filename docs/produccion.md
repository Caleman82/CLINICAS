# Puesta en producción

## Supabase (dashboard del proyecto)

**Authentication → Sign In / Providers**
- Allow new users to sign up: **desactivado** (no hay registro libre).
- Anonymous sign-ins: desactivado.
- Email: confirmación de email desactivada (los usuarios los crea el servidor ya confirmados).
- Phone / proveedores externos: desactivados.

**Authentication → Policies de contraseña**
- Minimum password length: 8. (El requisito "al menos un número" se valida en la app.)
- Leaked password protection: activado (plan Pro).

**Authentication → Sessions** (plan Pro)
- Time-box user sessions: 12 h. Inactivity timeout: 8 h.
- JWT expiry (Settings → JWT): 3600 s.

**Authentication → Rate limits**: dejar los valores por defecto o más estrictos. La app suma su propio límite (tabla `intentos_login`).

**Authentication → Multi-Factor**: TOTP habilitado (para la fase 6; obligatorio para superadmin).

**API → Exposed schemas**: solo `public`. **No** exponer `app`.

**Database → Backups**: plan con backups diarios (Pro) y, si es posible, Point-in-Time Recovery.

## Migraciones

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Luego crear el primer superadmin con `npm run crear-superadmin` (con `.env.local` apuntando al proyecto).

### Verificación posterior (una vez por proyecto)
1. Desactivar un miembro de prueba y confirmar que su sesión se cierra: `select count(*) from auth.sessions where user_id = '<id>'` debe dar 0. Si no, revisar el log por el aviso `No se pudieron cerrar las sesiones` y otorgar `delete` sobre `auth.sessions` al rol dueño de las funciones (`postgres`).
2. `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where nspname = 'public' and relkind = 'r' and not relrowsecurity;` → debe dar vacío.
3. Con la anon key, `GET /rest/v1/clinicas` debe responder `permission denied`.

## Vercel

Variables de entorno (Production y Preview, **nunca** en el repositorio):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; no usar prefijo `NEXT_PUBLIC_`)
- `APP_URL` (ej. `https://panel.<dominio>`)
- `RESEND_API_KEY`, `EMAIL_FROM` (opcional; ver abajo)

Solo HTTPS: Vercel lo fuerza; además la app envía `Strict-Transport-Security`.

## Email (Resend)

1. Crear cuenta en Resend y verificar el dominio de envío (registros SPF/DKIM en el DNS).
2. Cargar `RESEND_API_KEY` y `EMAIL_FROM` en Vercel.
3. Probar: desde la ficha de un paciente de prueba con email, "Enviar invitación". El envío queda en el historial de mensajes de la ficha.

Los emails nunca incluyen información clínica: solo el enlace de activación.

## App del paciente (PWA)

- Dirección para cada clínica: `https://<dominio>/p/<slug>` (ej. `/p/cemer`). Es la que se comparte con los pacientes.
- Se instala desde el navegador (Android: botón "Instalar la app"; iPhone: Compartir → Agregar a pantalla de inicio). Requiere HTTPS.
- El service worker (`public/sw.js`) **no guarda datos de pacientes en el celular**: solo una pantalla "sin conexión".

## Backups y restauración

Supabase hace backups diarios automáticos (plan Pro; retención según plan).

**Restaurar el proyecto completo** (desastre): Dashboard → Database → Backups → elegir el punto → Restore. Deja el proyecto no disponible unos minutos. Avisar a las clínicas antes.

**Recuperar datos puntuales** (ej. una clínica borró algo por error) sin pisar el resto:
1. Crear un proyecto temporal y restaurar ahí el backup (o descargarlo desde Dashboard → Backups).
2. `pg_dump --data-only --table=public.<tabla> --where` sobre el proyecto temporal filtrando por `clinica_id`.
3. Revisar el volcado e insertarlo en producción con `psql` como `postgres`.
4. Borrar el proyecto temporal y registrar lo hecho.

Probar el procedimiento de restauración al menos una vez antes de salir con pacientes reales, y luego cada 6 meses.

## Checklist de seguridad antes de salir con pacientes reales

- [ ] Revisión externa de políticas RLS, funciones `security definer`, endpoints y variables de entorno (requisito 8.15).
- [ ] `npm test` en verde contra una copia de la base de producción (migraciones aplicadas).
- [ ] Registro público desactivado (probar `POST /auth/v1/signup` → debe fallar).
- [ ] La service_role key no aparece en el bundle del navegador (`grep` sobre `.next/static`).
- [ ] 2FA obligatoria para superadmin.
- [ ] Backups verificados y procedimiento de restauración probado.
- [ ] Contrato de encargado de tratamiento (Ley 18.331) firmado con cada clínica.
