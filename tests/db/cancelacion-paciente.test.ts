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

/**
 * Crea (como dueño) un turno de pacienteA1 que empieza dentro de `horas` horas,
 * ejecuta `fn` como el usuario dado y revierte todo al final.
 */
async function conTurno(horas: number, usuario: { id: string }, fn: (turnoId: string) => Promise<void>, preparar?: string) {
  await db.query("begin");
  try {
    if (preparar) await db.query(preparar);
    const r = await db.query(
      `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, inicio, fin)
       values ($1, $2, $3, $4, now() + make_interval(hours => $5::int), now() + make_interval(hours => $5::int, mins => 30))
       returning id`,
      [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, horas],
    );
    await db.query("set local role authenticated");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: usuario.id })]);
    await fn(r.rows[0].id);
  } finally {
    await db.query("rollback");
  }
}

const cancelar = (id: string) => db.query("select public.cancelar_mi_turno($1)", [id]);
// Recibe una función (no una promesa) para que la consulta corra después del savepoint.
const error = async (fn: () => Promise<unknown>) => {
  await db.query("savepoint s");
  try {
    await fn();
    await db.query("release savepoint s");
    return null;
  } catch (e) {
    await db.query("rollback to savepoint s");
    return (e as Error).message;
  }
};

describe("cancelación de turnos por el paciente", () => {
  it("con el plazo por defecto (48 h) puede cancelar un turno dentro de 5 días", async () => {
    await conTurno(120, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toBeNull();
      await db.query("reset role");
      const t = (await db.query("select estado, cancelado_por_paciente, cancelado_en from public.turnos where id = $1", [id])).rows[0];
      expect(t.estado).toBe("cancelado");
      expect(t.cancelado_por_paciente).toBe(true);
      expect(t.cancelado_en).not.toBeNull();
    });
  });

  it("fuera de plazo queda bloqueado y dice cuál es el plazo", async () => {
    await conTurno(30, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toMatch(/fuera de las horas posibles.*hasta 48 horas antes/);
    });
  });

  it("cada clínica elige su plazo: con 24 h, un turno a 30 h sí se cancela", async () => {
    await conTurno(30, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toBeNull();
    }, `update public.clinicas set horas_limite_cancelacion = 24 where id = '${F.clinicaA}'`);
  });

  it("con 72 h, un turno a 60 h ya no se cancela", async () => {
    await conTurno(60, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toMatch(/hasta 72 horas antes/);
    }, `update public.clinicas set horas_limite_cancelacion = 72 where id = '${F.clinicaA}'`);
  });

  it("mis_turnos informa si se puede cancelar y hasta cuándo, sin notas internas", async () => {
    await conTurno(120, F.pacienteA1, async (id) => {
      const filas = (await db.query("select * from public.mis_turnos()")).rows;
      const t = filas.find((f) => f.id === id);
      expect(t.puede_cancelar).toBe(true);
      expect(t.horas_limite_cancelacion).toBe(48);
      expect(new Date(t.inicio).getTime() - new Date(t.cancelable_hasta).getTime()).toBe(48 * 3600_000);
      expect(Object.keys(t)).not.toContain("notas_internas");
      // Solo sus turnos.
      expect(filas.every((f) => f.clinica_id === F.clinicaA)).toBe(true);
      expect(filas.length).toBe(2);
    });
    await conTurno(30, F.pacienteA1, async (id) => {
      const t = (await db.query("select puede_cancelar from public.mis_turnos() where id = $1", [id])).rows[0];
      expect(t.puede_cancelar).toBe(false);
    });
  });

  it("no puede cancelar turnos de otro paciente", async () => {
    await conTurno(120, F.pacienteA2, async (id) => {
      expect(await error(() => cancelar(id))).toMatch(/No encontramos ese turno/);
    });
  });

  it("no puede cancelar un turno ya atendido o cancelado", async () => {
    await conTurno(120, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toBeNull();
      expect(await error(() => cancelar(id))).toMatch(/ya no se puede cancelar/);
    });
  });

  it("con la clínica en solo lectura no se puede cancelar desde la app", async () => {
    await conTurno(120, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toMatch(/Comunicate con la clínica/);
    }, `update public.clinicas set estado_suscripcion = 'solo_lectura' where id = '${F.clinicaA}'`);
  });

  it("un paciente desactivado no puede cancelar", async () => {
    await conTurno(120, F.pacienteA1, async (id) => {
      expect(await error(() => cancelar(id))).toMatch(/No encontramos/);
    }, `update public.pacientes set estado_acceso = 'desactivado' where id = '${F.fichaPacA1}'`);
  });

  it("el equipo no puede marcar un turno como cancelado por el paciente", async () => {
    await conTurno(120, F.recepA, async (id) => {
      await db.query("update public.turnos set estado = 'cancelado', cancelado_por_paciente = true where id = $1", [id]);
      const t = (await db.query("select cancelado_por_paciente, cancelado_en from public.turnos where id = $1", [id])).rows[0];
      expect(t.cancelado_por_paciente).toBe(false);
      expect(t.cancelado_en).not.toBeNull();
    });
  });

  it("el admin puede cambiar el plazo, recepción no", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.ejecutar("update public.clinicas set horas_limite_cancelacion = 72 where id = $1", [F.clinicaA])).toBe(1);
      expect(await q.falla("update public.clinicas set horas_limite_cancelacion = 0 where id = $1", [F.clinicaA])).toMatch(/check constraint/);
    });
    await como(db, F.recepA, async (q) => {
      expect(await q.ejecutar("update public.clinicas set horas_limite_cancelacion = 72 where id = $1", [F.clinicaA])).toBe(0);
    });
  });
});
