# Gestión de clínicas

Software multi-clínica de Caleman Creativa: turnos, pacientes, recordatorios y app para pacientes.

- Stack: Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres, Auth, RLS), Vercel.
- Estado, decisiones y cómo correrlo: [`CLAUDE.md`](CLAUDE.md).
- Producción, backups y checklist de seguridad: [`docs/produccion.md`](docs/produccion.md).

```bash
npm install
cp .env.example .env.local
npm test        # tests de RLS y aislamiento (requiere Postgres local)
npm run dev
```
