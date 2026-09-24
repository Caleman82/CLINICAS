import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { F } from "./fixture";
import { conectar } from "./helpers";

let db: Client;
beforeAll(async () => {
  db = await conectar();
});
afterAll(async () => {
  await db.end();
});

/** Turno de pacienteA1 dentro de `horas` horas (negativo = pasado), ejecutado como `usuario`, todo revertido. */
async function conTurno(horas: number, usuario: { id: string }, fn: (id: string) => Promise<void>, preparar?: string, estado = "agendado") {
  await db.query("begin");
  try {
    if (preparar) await db.query(preparar);
    const r = await db.query(
      `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, inicio, fin, estado)
       values ($1, $2, $3, $4, now() + make_interval(hours => $5::int), now() + make_interval(hours => $5::int, mins => 30), $6)
       returning id`,
      [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, horas, estado],
    );
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: usuario.id })]);
    await fn(r.rows[0].id);
  } finally {
    await db.query("rollback");
  }
}

async function intentar(sql: string, params: unknown[]) {
  await db.query("savepoint s");
  try {
    await db.query(sql, params);
    await db.query("release savepoint s");
    return null;
  } catch (e) {
    await db.query("rollback to savepoint s");
    return (e as Error).message;
  }
}
const estado = async (id: string) => {
  await db.query("savepoint e");
  await db.query("reset role");
  const r = (await db.query("select estado from public.turnos where id = $1", [id])).rows[0].estado;
  await db.query("rollback to savepoint e");
  return r;
};

describe("acciones del paciente en la app", () => {
  it("confirma su turno y la agenda lo refleja", async () => {
    await conTurno(24, F.pacienteA1, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toBeNull();
      expect(await estado(id)).toBe("confirmado");
      // Confirmar dos veces no es error.
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toBeNull();
    });
  });

  it("pide reprogramación y después puede volver a confirmar", async () => {
    await conTurno(24, F.pacienteA1, async (id) => {
      expect(await intentar("select public.pedir_reprogramacion_mi_turno($1)", [id])).toBeNull();
      expect(await estado(id)).toBe("reprogramar_solicitado");
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toBeNull();
      expect(await estado(id)).toBe("confirmado");
    });
  });

  it("no puede tocar turnos pasados, atendidos o cancelados", async () => {
    await conTurno(-2, F.pacienteA1, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toMatch(/ya pasó/);
    });
    await conTurno(24, F.pacienteA1, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toMatch(/ya no se puede confirmar/);
      expect(await intentar("select public.pedir_reprogramacion_mi_turno($1)", [id])).toMatch(/ya no se puede reprogramar/);
    }, undefined, "cancelado");
  });

  it("no puede actuar sobre turnos de otro paciente", async () => {
    await conTurno(24, F.pacienteA2, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toMatch(/No encontramos/);
      expect(await intentar("select public.pedir_reprogramacion_mi_turno($1)", [id])).toMatch(/No encontramos/);
    });
  });

  it("el equipo no usa estas funciones para turnos ajenos a su ficha de paciente", async () => {
    await conTurno(24, F.recepA, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toMatch(/No encontramos/);
    });
  });

  it("con la clínica en solo lectura, no hay cambios desde la app", async () => {
    await conTurno(24, F.pacienteA1, async (id) => {
      expect(await intentar("select public.confirmar_mi_turno($1)", [id])).toMatch(/Comunicate con la clínica/);
    }, `update public.clinicas set estado_suscripcion = 'solo_lectura' where id = '${F.clinicaA}'`);
  });

  it("mi_clinica devuelve solo la marca y el contacto de su clínica", async () => {
    await conTurno(24, F.pacienteA1, async () => {
      const r = (await db.query("select * from public.mi_clinica()")).rows;
      expect(r).toHaveLength(1);
      expect(r[0].id).toBe(F.clinicaA);
      expect(Object.keys(r[0])).not.toContain("precio_mensual");
    });
    await conTurno(24, F.recepA, async () => {
      expect((await db.query("select * from public.mi_clinica()")).rowCount).toBe(0);
    });
  });

  it("las funciones internas no son invocables por clientes", async () => {
    await conTurno(24, F.pacienteA1, async (id) => {
      expect(await intentar("select * from app.turno_del_paciente($1)", [id])).toMatch(/permission denied/);
    });
  });
});
