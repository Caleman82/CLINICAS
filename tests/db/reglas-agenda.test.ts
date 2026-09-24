import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { F } from "./fixture";
import { como, conectar, type Consultor } from "./helpers";

let db: Client;
beforeAll(async () => {
  db = await conectar();
});
afterAll(async () => {
  await db.end();
});

const insertar = `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, recurso_id, paquete_id, inicio, fin)
                  values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz + interval '30 minutes') returning id`;

async function nuevoTurno(q: Consultor, inicio: string, extra: { paquete?: string | null; recurso?: string | null; prof?: string; paciente?: string } = {}) {
  const [t] = await q.filas<{ id: string }>(insertar, [
    F.clinicaA, extra.paciente ?? F.fichaPacA1, extra.prof ?? F.fichaProfA, F.servicioA, extra.recurso ?? null, extra.paquete ?? null, inicio,
  ]);
  return t.id;
}

const usadas = async (q: Consultor, paquete = F.paqueteA1) =>
  (await q.filas<{ n: number }>("select sesiones_usadas as n from public.paquetes where id = $1", [paquete]))[0].n;

describe("paquetes", () => {
  it("al marcar atendido se descuenta una sesión y al corregir se devuelve", async () => {
    await como(db, F.recepA, async (q) => {
      const id = await nuevoTurno(q, "2026-11-02T10:00:00-03:00", { paquete: F.paqueteA1 });
      expect(await usadas(q)).toBe(0);
      await q.ejecutar("update public.turnos set estado = 'confirmado' where id = $1", [id]);
      expect(await usadas(q)).toBe(0);
      await q.ejecutar("update public.turnos set estado = 'atendido' where id = $1", [id]);
      expect(await usadas(q)).toBe(1);
      await q.ejecutar("update public.turnos set estado = 'atendido' where id = $1", [id]);
      expect(await usadas(q)).toBe(1);
      await q.ejecutar("update public.turnos set estado = 'no_asistio' where id = $1", [id]);
      expect(await usadas(q)).toBe(0);
    });
  });

  it("el profesional puede marcar atendido y se descuenta aunque no edite paquetes", async () => {
    await como(db, F.recepA, async (q) => {
      await nuevoTurno(q, "2026-11-03T10:00:00-03:00", { paquete: F.paqueteA1 });
    });
    await db.query("begin");
    try {
      await db.query(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, F.paqueteA1, "2026-11-03T10:00:00-03:00"]);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.profA.id })]);
      const r = await db.query("update public.turnos set estado = 'atendido' where inicio = '2026-11-03T10:00:00-03:00' and profesional_id = $1", [F.fichaProfA]);
      expect(r.rowCount).toBe(1);
      await db.query("reset role");
      expect((await db.query("select sesiones_usadas from public.paquetes where id = $1", [F.paqueteA1])).rows[0].sesiones_usadas).toBe(1);
    } finally {
      await db.query("rollback");
    }
  });

  it("no se puede usar un paquete agotado", async () => {
    await como(db, F.recepA, async (q) => {
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await nuevoTurno(q, `2026-11-1${i}T10:00:00-03:00`, { paquete: F.paqueteA1 }));
      for (const id of ids) await q.ejecutar("update public.turnos set estado = 'atendido' where id = $1", [id]);
      expect(await usadas(q)).toBe(5);
      const err = await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, F.paqueteA1, "2026-11-20T10:00:00-03:00"]);
      expect(err).toMatch(/no tiene sesiones disponibles/);
    });
  });

  it("no se puede atender más sesiones que las del paquete", async () => {
    await como(db, F.recepA, async (q) => {
      const ids = [];
      for (let i = 0; i < 6; i++) ids.push(await nuevoTurno(q, `2026-11-2${i}T10:00:00-03:00`, { paquete: F.paqueteA1 }));
      for (const id of ids.slice(0, 5)) await q.ejecutar("update public.turnos set estado = 'atendido' where id = $1", [id]);
      expect(await q.falla("update public.turnos set estado = 'atendido' where id = $1", [ids[5]])).toMatch(/no tiene sesiones disponibles/);
    });
  });

  it("el paquete debe ser del mismo servicio y del mismo paciente", async () => {
    await como(db, F.adminA, async (q) => {
      const [s] = await q.filas<{ id: string }>("insert into public.servicios (clinica_id, nombre, duracion_min) values ($1, 'Láser', 45) returning id", [F.clinicaA]);
      const err = await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, s.id, null, F.paqueteA1, "2026-11-04T10:00:00-03:00"]);
      expect(err).toMatch(/otro servicio/);
      const err2 = await q.falla(insertar, [F.clinicaA, F.fichaPacA2, F.fichaProfA, F.servicioA, null, F.paqueteA1, "2026-11-04T11:00:00-03:00"]);
      expect(err2).toMatch(/foreign key/);
    });
  });

  it("recepción no puede editar las sesiones usadas a mano", async () => {
    await como(db, F.recepA, async (q) => {
      expect(await q.falla("update public.paquetes set sesiones_usadas = 3 where id = $1", [F.paqueteA1])).toMatch(/no modificable/);
      expect(await q.ejecutar("update public.paquetes set vence_en = '2027-01-01' where id = $1", [F.paqueteA1])).toBe(1);
      const [p] = await q.filas<{ sesiones_usadas: number }>(
        "insert into public.paquetes (clinica_id, paciente_id, servicio_id, sesiones_totales, sesiones_usadas) values ($1, $2, $3, 4, 4) returning sesiones_usadas",
        [F.clinicaA, F.fichaPacA2, F.servicioA],
      );
      expect(p.sesiones_usadas).toBe(0);
    });
  });

  it("no se puede agendar con un paquete vencido para esa fecha", async () => {
    await como(db, F.recepA, async (q) => {
      await q.ejecutar("update public.paquetes set vence_en = '2026-11-01' where id = $1", [F.paqueteA1]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, F.paqueteA1, "2026-11-05T10:00:00-03:00"])).toMatch(/vence/);
    });
  });
});

describe("validaciones del turno", () => {
  it("respeta los bloqueos de agenda del recurso y del profesional", async () => {
    await como(db, F.recepA, async (q) => {
      // El fixture bloquea el recursoA el 24/12 de 9 a 18.
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, F.recursoA, null, "2026-12-24T10:00:00-03:00"])).toMatch(/bloqueado/);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, null, "2026-12-24T10:00:00-03:00"])).toBeNull();
      await q.ejecutar(
        "insert into public.bloqueos_agenda (clinica_id, profesional_id, desde, hasta, motivo) values ($1, $2, '2026-12-26T00:00:00-03:00', '2026-12-27T00:00:00-03:00', 'Licencia')",
        [F.clinicaA, F.fichaProfA2],
      );
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, null, null, "2026-12-26T15:00:00-03:00"])).toMatch(/bloqueado/);
    });
  });

  it("exige recurso del tipo que pide el servicio", async () => {
    await como(db, F.adminA, async (q) => {
      await q.ejecutar("update public.servicios set requiere_recurso_tipo = 'cabina' where id = $1", [F.servicioA]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, null, null, "2026-11-06T10:00:00-03:00"])).toMatch(/requiere un recurso/);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, F.recursoA, null, "2026-11-06T10:00:00-03:00"])).toMatch(/tipo requerido/);
      const [r] = await q.filas<{ id: string }>("insert into public.recursos (clinica_id, nombre, tipo) values ($1, 'Cabina 1', 'cabina') returning id", [F.clinicaA]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, r.id, null, "2026-11-06T10:00:00-03:00"])).toBeNull();
    });
  });

  it("el profesional debe realizar el servicio (si el servicio tiene profesionales asignados)", async () => {
    await como(db, F.adminA, async (q) => {
      await q.ejecutar("delete from public.servicio_profesional where profesional_id = $1", [F.fichaProfA2]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, null, null, "2026-11-07T10:00:00-03:00"])).toMatch(/no realiza/);
      await q.ejecutar("delete from public.servicio_profesional where servicio_id = $1", [F.servicioA]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, null, null, "2026-11-07T10:00:00-03:00"])).toBeNull();
    });
  });

  it("no se agenda con un profesional inactivo", async () => {
    await como(db, F.adminA, async (q) => {
      await q.ejecutar("update public.profesionales set activo = false where id = $1", [F.fichaProfA2]);
      expect(await q.falla(insertar, [F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, null, null, "2026-11-08T10:00:00-03:00"])).toMatch(/no está activo/);
    });
  });

  it("cancelar un turno no se bloquea aunque el servicio ya no esté activo", async () => {
    await como(db, F.adminA, async (q) => {
      await q.ejecutar("update public.servicios set activo = false where id = $1", [F.servicioA]);
      expect(await q.ejecutar("update public.turnos set estado = 'cancelado' where profesional_id = $1", [F.fichaProfA])).toBe(1);
    });
  });
});

describe("búsqueda de pacientes", () => {
  it("busca por nombre sin tildes, cédula y celular, respetando RLS", async () => {
    await db.query("begin");
    try {
      await db.query("update public.pacientes set nombre = 'José', apellido = 'Pérez', celular = '099 123 456' where id = $1", [F.fichaPacA1]);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.recepA.id })]);
      const buscar = async (t: string) => (await db.query("select id from public.buscar_pacientes($1, $2)", [F.clinicaA, t])).rows.map((r) => r.id);
      expect(await buscar("jose perez")).toEqual([F.fichaPacA1]);
      expect(await buscar("PÉREZ")).toEqual([F.fichaPacA1]);
      expect(await buscar("perez jose")).toEqual([F.fichaPacA1]);
      expect(await buscar("jose gomez")).toEqual([]);
      expect(await buscar("1.111.111")).toEqual([F.fichaPacA1]);
      expect(await buscar("099123")).toEqual([F.fichaPacA1]);
      expect(await buscar("")).toHaveLength(2);
      // Otra clínica: nada, aunque se pase su id.
      expect((await db.query("select id from public.buscar_pacientes($1, '')", [F.clinicaB])).rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});
