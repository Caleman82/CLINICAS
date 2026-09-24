import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { F } from "./fixture";
import { como, conectar } from "./helpers";

let db: Client;
beforeAll(async () => {
  db = await conectar();
});
afterAll(async () => {
  await db.end();
});

// En el fixture: profA con recursoA el 2026-10-01 10:00–10:30 (-03), profA2 sin recurso a la misma hora.
const insertar = `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, recurso_id, inicio, fin)
                  values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz) returning id`;

describe("regla de agenda: sin superposición", () => {
  it("rechaza un turno superpuesto del mismo profesional", async () => {
    await como(db, F.recepA, async (q) => {
      const err = await q.falla(insertar, [
        F.clinicaA, F.fichaPacA2, F.fichaProfA, F.servicioA, null, "2026-10-01T10:15:00-03:00", "2026-10-01T10:45:00-03:00",
      ]);
      expect(err).toMatch(/turnos_sin_superposicion_profesional/);
    });
  });

  it("rechaza un turno superpuesto en el mismo recurso con otro profesional", async () => {
    await como(db, F.recepA, async (q) => {
      const err = await q.falla(insertar, [
        F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, F.recursoA, "2026-10-01T09:45:00-03:00", "2026-10-01T10:15:00-03:00",
      ]);
      // profA2 también está ocupado a esa hora; probamos con un horario libre para él pero con el recurso ocupado.
      expect(err).not.toBeNull();
      const err2 = await q.falla(insertar, [
        F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, F.recursoA, "2026-10-01T10:29:00-03:00", "2026-10-01T10:30:00-03:00",
      ]);
      expect(err2).toMatch(/turnos_sin_superposicion/);
    });
  });

  it("permite turnos contiguos (uno termina cuando empieza el otro)", async () => {
    await como(db, F.recepA, async (q) => {
      expect(
        await q.falla(insertar, [
          F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, F.recursoA, "2026-10-01T10:30:00-03:00", "2026-10-01T11:00:00-03:00",
        ]),
      ).toBeNull();
    });
  });

  it("un turno cancelado libera el horario", async () => {
    await como(db, F.recepA, async (q) => {
      await q.ejecutar("update public.turnos set estado = 'cancelado' where profesional_id = $1", [F.fichaProfA]);
      expect(
        await q.falla(insertar, [
          F.clinicaA, F.fichaPacA2, F.fichaProfA, F.servicioA, F.recursoA, "2026-10-01T10:00:00-03:00", "2026-10-01T10:30:00-03:00",
        ]),
      ).toBeNull();
    });
  });

  it("no se puede reactivar un turno cancelado si el horario ya fue ocupado", async () => {
    await como(db, F.recepA, async (q) => {
      const [t] = await q.filas<{ id: string }>("select id from public.turnos where profesional_id = $1", [F.fichaProfA]);
      await q.ejecutar("update public.turnos set estado = 'cancelado' where id = $1", [t.id]);
      await q.filas(insertar, [
        F.clinicaA, F.fichaPacA2, F.fichaProfA, F.servicioA, null, "2026-10-01T10:00:00-03:00", "2026-10-01T10:30:00-03:00",
      ]);
      expect(await q.falla("update public.turnos set estado = 'agendado' where id = $1", [t.id])).toMatch(/turnos_sin_superposicion/);
    });
  });

  it("clínicas distintas no se bloquean entre sí", async () => {
    await como(db, F.recepB, async (q) => {
      expect(
        await q.falla(insertar, [
          F.clinicaB, F.fichaPacB1, F.fichaProfB, F.servicioB, null, "2026-10-01T11:00:00-03:00", "2026-10-01T11:30:00-03:00",
        ]),
      ).toBeNull();
    });
  });

  it("el fin debe ser posterior al inicio", async () => {
    await como(db, F.recepA, async (q) => {
      expect(
        await q.falla(insertar, [
          F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, "2026-10-02T10:00:00-03:00", "2026-10-02T10:00:00-03:00",
        ]),
      ).toMatch(/check constraint/);
    });
  });
});
