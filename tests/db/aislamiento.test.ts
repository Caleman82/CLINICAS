import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { F } from "./fixture";
import { como, conectar } from "./helpers";

let db: Client;
let tablasConClinica: string[] = [];
let todasLasTablas: string[] = [];

beforeAll(async () => {
  db = await conectar();
  todasLasTablas = (
    await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)
  ).rows.map((r) => r.tablename);
  tablasConClinica = (
    await db.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'clinica_id' order by 1`,
    )
  ).rows.map((r) => r.table_name);
});

afterAll(async () => {
  await db.end();
});

const equipoA = () => [F.adminA, F.recepA, F.profA, F.profA2];
const equipoB = () => [F.adminB, F.recepB, F.profB];

describe("reglas generales", () => {
  it("todas las tablas de public tienen RLS activado", async () => {
    const sinRls = (
      await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`)
    ).rows.map((r) => r.relname);
    expect(sinRls).toEqual([]);
  });

  it("el rol anon no tiene ningún permiso sobre tablas de public", async () => {
    const permisos = (
      await db.query(`select table_name, privilege_type from information_schema.role_table_grants
                      where grantee = 'anon' and table_schema = 'public'`)
    ).rows;
    expect(permisos).toEqual([]);
  });

  it("el cliente no puede hacer TRUNCATE (no pasa por RLS)", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("truncate public.turnos cascade")).toMatch(/permission denied/);
    });
  });

  it("anon no puede leer nada", async () => {
    await como(db, "anon", async (q) => {
      for (const t of todasLasTablas) {
        expect(await q.falla(`select * from public.${t}`), t).toMatch(/permission denied/);
      }
    });
  });

  it("ningún cliente puede leer los intentos de ingreso", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("select * from public.intentos_login")).toMatch(/permission denied/);
    });
  });

  it("las funciones de servidor no son invocables por clientes", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("select public.srv_usuario_por_email('x@test.local')")).toMatch(/permission denied/);
      expect(await q.falla(`select public.srv_cerrar_sesiones('${F.adminB.id}')`)).toMatch(/permission denied/);
      expect(await q.falla(`select app.cerrar_sesiones('${F.adminB.id}')`)).toMatch(/permission denied/);
    });
  });
});

describe("aislamiento entre clínicas", () => {
  it("nadie del equipo de A lee filas de B en ninguna tabla (y viceversa)", async () => {
    for (const [equipo, propia] of [
      [equipoA(), F.clinicaA],
      [equipoB(), F.clinicaB],
    ] as const) {
      for (const usuario of equipo) {
        await como(db, usuario, async (q) => {
          for (const t of tablasConClinica) {
            if (t === "intentos_login") continue;
            const ajenas = await q.cuenta(`select 1 from public.${t} where clinica_id <> $1`, [propia]);
            expect(ajenas, `${usuario.id} en ${t}`).toBe(0);
          }
          const otras = await q.cuenta(`select 1 from public.clinicas where id <> $1`, [propia]);
          expect(otras).toBe(0);
        });
      }
    }
  });

  it("el admin de A sí ve los datos de su clínica", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.cuenta("select 1 from public.clinicas")).toBe(1);
      expect(await q.cuenta("select 1 from public.pacientes")).toBe(2);
      expect(await q.cuenta("select 1 from public.turnos")).toBe(2);
      expect(await q.cuenta("select 1 from public.membresias")).toBe(4);
      expect(await q.cuenta("select 1 from public.notas_clinicas")).toBe(2);
    });
  });

  it("el admin de A no puede escribir en B", async () => {
    await como(db, F.adminA, async (q) => {
      expect(
        await q.falla(
          `insert into public.pacientes (clinica_id, nombre, apellido, cedula, consentimiento_registrado, consentimiento_fecha)
           values ($1, 'X', 'Y', '44444444', true, now())`,
          [F.clinicaB],
        ),
      ).toMatch(/row-level security/);
      expect(await q.falla(`insert into public.servicios (clinica_id, nombre, duracion_min) values ($1, 'X', 30)`, [F.clinicaB])).toMatch(/row-level security/);
      expect(await q.ejecutar(`update public.pacientes set nombre = 'Hackeado' where clinica_id = $1`, [F.clinicaB])).toBe(0);
      expect(await q.ejecutar(`update public.clinicas set nombre = 'Hackeada' where id = $1`, [F.clinicaB])).toBe(0);
      expect(await q.ejecutar(`update public.membresias set activo = false where clinica_id = $1`, [F.clinicaB])).toBe(0);
      expect(await q.ejecutar(`delete from public.servicios where clinica_id = $1`, [F.clinicaB])).toBe(0);
    });
  });

  it("no se puede mover un registro propio a otra clínica", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla(`update public.servicios set clinica_id = $1 where id = $2`, [F.clinicaB, F.servicioA])).not.toBeNull();
    });
  });

  it("no se puede vincular un turno de A con un paciente de B (FK compuesta)", async () => {
    await como(db, F.recepA, async (q) => {
      const err = await q.falla(
        `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, inicio, fin)
         values ($1, $2, $3, $4, '2026-11-01T10:00:00-03:00', '2026-11-01T10:30:00-03:00')`,
        [F.clinicaA, F.fichaPacB1, F.fichaProfA, F.servicioA],
      );
      expect(err).toMatch(/foreign key/);
    });
  });

  it("el admin de A no puede vincular un profesional a un usuario de B", async () => {
    await como(db, F.adminA, async (q) => {
      expect(
        await q.falla(`insert into public.profesionales (clinica_id, user_id, nombre_visible) values ($1, $2, 'Intruso')`, [
          F.clinicaA, F.adminB.id,
        ]),
      ).toMatch(/pertenecer al equipo/);
    });
  });

  it("registrar_acceso no permite auditar en una clínica ajena", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla(`select public.registrar_acceso($1, 'ver', 'pacientes', 'x')`, [F.clinicaB])).toMatch(/Sin acceso/);
      expect(await q.falla(`select public.registrar_acceso($1, 'ver', 'pacientes', 'x')`, [F.clinicaA])).toBeNull();
    });
  });
});

describe("roles dentro de la clínica", () => {
  it("recepción no lee notas clínicas ni puede crearlas", async () => {
    await como(db, F.recepA, async (q) => {
      expect(await q.cuenta("select 1 from public.notas_clinicas")).toBe(0);
      expect(
        await q.falla(`insert into public.notas_clinicas (clinica_id, paciente_id, profesional_id, texto) values ($1, $2, $3, 'x')`, [
          F.clinicaA, F.fichaPacA1, F.fichaProfA,
        ]),
      ).toMatch(/row-level security/);
    });
  });

  it("recepción no ve campos personalizados reservados a profesionales", async () => {
    await como(db, F.recepA, async (q) => {
      const valores = await q.filas<{ valor: string }>("select valor from public.valores_campos");
      expect(valores.map((v) => v.valor)).toEqual(["CASMU"]);
    });
    await como(db, F.profA, async (q) => {
      expect(await q.cuenta("select 1 from public.valores_campos")).toBe(2);
    });
  });

  it("un profesional ve solo a sus pacientes, su agenda y sus notas", async () => {
    await como(db, F.profA, async (q) => {
      const pacientes = await q.filas<{ id: string }>("select id from public.pacientes");
      expect(pacientes.map((p) => p.id)).toEqual([F.fichaPacA1]);
      const turnos = await q.filas<{ profesional_id: string }>("select profesional_id from public.turnos");
      expect(turnos.map((t) => t.profesional_id)).toEqual([F.fichaProfA]);
      const notas = await q.filas<{ paciente_id: string }>("select paciente_id from public.notas_clinicas");
      expect(notas.map((n) => n.paciente_id)).toEqual([F.fichaPacA1]);
    });
  });

  it("un profesional no puede escribir notas de pacientes ajenos ni firmar como otro", async () => {
    await como(db, F.profA, async (q) => {
      const ins = `insert into public.notas_clinicas (clinica_id, paciente_id, profesional_id, texto) values ($1, $2, $3, 'x')`;
      expect(await q.falla(ins, [F.clinicaA, F.fichaPacA2, F.fichaProfA])).toMatch(/row-level security/);
      expect(await q.falla(ins, [F.clinicaA, F.fichaPacA1, F.fichaProfA2])).toMatch(/row-level security/);
      expect(await q.falla(ins, [F.clinicaA, F.fichaPacA1, F.fichaProfA])).toBeNull();
    });
  });

  it("las notas clínicas no se pueden editar ni borrar", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("update public.notas_clinicas set texto = 'x'")).toMatch(/permission denied/);
      expect(await q.falla("delete from public.notas_clinicas")).toMatch(/permission denied/);
    });
  });

  it("recepción no puede editar configuración ni el equipo", async () => {
    await como(db, F.recepA, async (q) => {
      expect(await q.ejecutar("update public.servicios set nombre = 'x'")).toBe(0);
      expect(await q.ejecutar("update public.membresias set rol = 'admin_clinica'")).toBe(0);
      expect(await q.ejecutar("update public.clinicas set nombre = 'x'")).toBe(0);
    });
  });

  it("el admin no puede modificar su propia membresía (evita autobloqueo)", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.ejecutar("update public.membresias set activo = false where user_id = $1", [F.adminA.id])).toBe(0);
      expect(await q.ejecutar("update public.membresias set rol = 'profesional' where user_id = $1", [F.recepA.id])).toBe(1);
    });
  });

  it("nadie del equipo puede crear membresías directamente (se hace desde el servidor)", async () => {
    await como(db, F.adminA, async (q) => {
      expect(
        await q.falla(`insert into public.membresias (clinica_id, user_id, rol, nombre, email) values ($1, $2, 'admin_clinica', 'X Y', 'x@y.z')`, [
          F.clinicaA, F.adminB.id,
        ]),
      ).toMatch(/row-level security/);
    });
  });

  it("recepción no puede vincular una ficha de paciente a una identidad", async () => {
    await como(db, F.recepA, async (q) => {
      expect(await q.falla("update public.pacientes set user_id = $1 where id = $2", [F.recepA.id, F.fichaPacA1])).toMatch(/no modificable/);
      expect(
        await q.falla(
          `insert into public.pacientes (clinica_id, user_id, nombre, apellido, cedula, consentimiento_registrado, consentimiento_fecha)
           values ($1, $2, 'X', 'Y', '55555555', true, now())`,
          [F.clinicaA, F.recepA.id],
        ),
      ).toMatch(/por invitación/);
    });
  });

  it("no se puede crear un paciente sin consentimiento", async () => {
    await como(db, F.recepA, async (q) => {
      expect(
        await q.falla(
          `insert into public.pacientes (clinica_id, nombre, apellido, cedula, consentimiento_registrado, consentimiento_fecha)
           values ($1, 'X', 'Y', '55555555', false, now())`,
          [F.clinicaA],
        ),
      ).toMatch(/check constraint/);
      expect(
        await q.falla(
          `insert into public.pacientes (clinica_id, nombre, apellido, cedula, consentimiento_registrado, consentimiento_fecha)
           values ($1, 'X', 'Y', '55555555', true, now())`,
          [F.clinicaA],
        ),
      ).toBeNull();
    });
  });

  it("las invitaciones y mensajes solo los crea el servidor", async () => {
    await como(db, F.adminA, async (q) => {
      expect(
        await q.falla(`insert into public.invitaciones (clinica_id, paciente_id, token_hash, vence_en) values ($1, $2, repeat('a', 64), now())`, [
          F.clinicaA, F.fichaPacA1,
        ]),
      ).toMatch(/permission denied/);
      expect(await q.falla(`insert into public.mensajes (clinica_id, paciente_id, canal) values ($1, $2, 'email')`, [F.clinicaA, F.fichaPacA1])).toMatch(/permission denied/);
      expect(await q.falla(`insert into public.auditoria (accion, entidad) values ('x', 'y')`)).toMatch(/permission denied/);
    });
  });
});

describe("pacientes", () => {
  it("un paciente ve solo su ficha y sus paquetes", async () => {
    await como(db, F.pacienteA1, async (q) => {
      const fichas = await q.filas<{ id: string }>("select id from public.pacientes");
      expect(fichas.map((f) => f.id)).toEqual([F.fichaPacA1]);
      const paquetes = await q.filas<{ id: string }>("select id from public.paquetes");
      expect(paquetes.map((p) => p.id)).toEqual([F.paqueteA1]);
    });
  });

  it("un paciente no lee turnos, notas, mensajes, equipo ni datos de otra clínica", async () => {
    await como(db, F.pacienteA1, async (q) => {
      for (const t of ["turnos", "notas_clinicas", "mensajes", "membresias", "invitaciones", "valores_campos",
                       "pagos_suscripcion", "auditoria", "clinicas", "plantillas_mensaje", "campos_personalizados"]) {
        expect(await q.cuenta(`select 1 from public.${t}`), t).toBe(0);
      }
      expect(await q.cuenta("select 1 from public.servicios where clinica_id <> $1", [F.clinicaA])).toBe(0);
      expect(await q.cuenta("select 1 from public.avisos")).toBe(1);
    });
  });

  it("un paciente no puede escribir nada", async () => {
    await como(db, F.pacienteA1, async (q) => {
      expect(await q.ejecutar("update public.pacientes set nombre = 'x'")).toBe(0);
      expect(await q.ejecutar("update public.paquetes set sesiones_usadas = 0")).toBe(0);
      expect(
        await q.falla(
          `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, inicio, fin)
           values ($1, $2, $3, $4, '2026-11-01T10:00:00-03:00', '2026-11-01T10:30:00-03:00')`,
          [F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA],
        ),
      ).toMatch(/row-level security/);
    });
  });

  it("un paciente desactivado pierde el acceso y sus sesiones", async () => {
    await como(db, F.recepA, async (q) => {
      expect(await q.ejecutar("update public.pacientes set estado_acceso = 'desactivado' where id = $1", [F.fichaPacA1])).toBe(1);
    });
    // como() revierte; repetimos dentro de una sola transacción para verificar el efecto.
    await db.query("begin");
    try {
      await db.query("update public.pacientes set estado_acceso = 'desactivado' where id = $1", [F.fichaPacA1]);
      const sesiones = await db.query("select 1 from auth.sessions where user_id = $1", [F.pacienteA1.id]);
      expect(sesiones.rowCount).toBe(0);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.pacienteA1.id })]);
      expect((await db.query("select 1 from public.pacientes")).rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});

describe("superadmin", () => {
  it("ve todas las clínicas y los pagos, pero ningún dato de pacientes", async () => {
    await como(db, F.superadmin, async (q) => {
      expect(await q.cuenta("select 1 from public.clinicas")).toBe(2);
      expect(await q.cuenta("select 1 from public.pagos_suscripcion")).toBe(2);
      for (const t of ["pacientes", "turnos", "notas_clinicas", "valores_campos", "paquetes", "mensajes", "invitaciones"]) {
        expect(await q.cuenta(`select 1 from public.${t}`), t).toBe(0);
      }
    });
  });

  it("puede crear clínicas y cambiar su estado de suscripción", async () => {
    await como(db, F.superadmin, async (q) => {
      expect(await q.falla("insert into public.clinicas (nombre, slug) values ('Nueva', 'nueva')")).toBeNull();
      expect(await q.ejecutar("update public.clinicas set estado_suscripcion = 'gracia' where id = $1", [F.clinicaA])).toBe(1);
    });
  });

  it("nadie más puede crear clínicas", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("insert into public.clinicas (nombre, slug) values ('Nueva', 'nueva')")).toMatch(/row-level security/);
    });
  });
});

describe("suscripción aplicada en la base", () => {
  const conEstado = async (estado: string, fn: () => Promise<void>) => {
    await db.query("update public.clinicas set estado_suscripcion = $1 where id = $2", [estado, F.clinicaA]);
    try {
      await fn();
    } finally {
      await db.query("update public.clinicas set estado_suscripcion = 'activa' where id = $1", [F.clinicaA]);
    }
  };
  const altaPaciente = `insert into public.pacientes (clinica_id, nombre, apellido, cedula, consentimiento_registrado, consentimiento_fecha)
                        values ($1, 'X', 'Y', '66666666', true, now())`;

  it("en gracia todo funciona", async () => {
    await conEstado("gracia", async () => {
      await como(db, F.recepA, async (q) => {
        expect(await q.falla(altaPaciente, [F.clinicaA])).toBeNull();
      });
    });
  });

  it("en solo lectura se lee pero no se escribe", async () => {
    await conEstado("solo_lectura", async () => {
      await como(db, F.recepA, async (q) => {
        expect(await q.cuenta("select 1 from public.pacientes")).toBe(2);
        expect(await q.falla(altaPaciente, [F.clinicaA])).toMatch(/row-level security/);
        expect(await q.ejecutar("update public.turnos set estado = 'confirmado'")).toBe(0);
      });
      await como(db, F.adminA, async (q) => {
        expect(await q.ejecutar("update public.servicios set nombre = 'x'")).toBe(0);
      });
    });
  });

  it("suspendida: el equipo no accede, el admin solo lee (para exportar), el paciente no ve nada", async () => {
    await conEstado("suspendida", async () => {
      await como(db, F.recepA, async (q) => {
        expect(await q.cuenta("select 1 from public.pacientes")).toBe(0);
        expect(await q.cuenta("select 1 from public.turnos")).toBe(0);
      });
      await como(db, F.profA, async (q) => {
        expect(await q.cuenta("select 1 from public.notas_clinicas")).toBe(0);
      });
      await como(db, F.adminA, async (q) => {
        expect(await q.cuenta("select 1 from public.pacientes")).toBe(2);
        expect(await q.falla(altaPaciente, [F.clinicaA])).toMatch(/row-level security/);
      });
      await como(db, F.pacienteA1, async (q) => {
        expect(await q.cuenta("select 1 from public.pacientes")).toBe(0);
      });
      // La otra clínica no se ve afectada.
      await como(db, F.recepB, async (q) => {
        expect(await q.cuenta("select 1 from public.pacientes")).toBe(1);
      });
    });
  });

  it("el admin de la clínica no puede cambiar su estado de suscripción ni su plan", async () => {
    await como(db, F.adminA, async (q) => {
      expect(await q.falla("update public.clinicas set estado_suscripcion = 'gracia' where id = $1", [F.clinicaA])).toMatch(/Solo el proveedor/);
      expect(await q.falla("update public.clinicas set precio_mensual = 0 where id = $1", [F.clinicaA])).toMatch(/Solo el proveedor/);
      expect(await q.ejecutar("update public.clinicas set telefono_contacto = '099 123 456' where id = $1", [F.clinicaA])).toBe(1);
    });
  });
});

describe("desactivación de miembros del equipo", () => {
  it("un miembro desactivado pierde el acceso al instante y se cierran sus sesiones", async () => {
    await db.query("begin");
    try {
      await db.query("update public.membresias set activo = false where user_id = $1", [F.recepA.id]);
      expect((await db.query("select 1 from auth.sessions where user_id = $1", [F.recepA.id])).rowCount).toBe(0);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.recepA.id })]);
      expect((await db.query("select 1 from public.pacientes")).rowCount).toBe(0);
      expect((await db.query("select 1 from public.clinicas")).rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});

describe("auditoría", () => {
  it("registra cambios en fichas sin copiar los valores", async () => {
    await como(db, F.recepA, async (q) => {
      await q.ejecutar("update public.pacientes set celular = '099111222' where id = $1", [F.fichaPacA1]);
    });
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: F.recepA.id })]);
      await db.query("update public.pacientes set celular = '099111222' where id = $1", [F.fichaPacA1]);
      await db.query("reset role");
      const r = await db.query(
        "select user_id, accion, entidad, detalle from public.auditoria where entidad = 'pacientes' and accion = 'update' order by id desc limit 1",
      );
      expect(r.rows[0]).toMatchObject({ user_id: F.recepA.id, accion: "update", entidad: "pacientes", detalle: { columnas: ["celular"] } });
      expect(JSON.stringify(r.rows[0].detalle)).not.toContain("099111222");
    } finally {
      await db.query("rollback");
    }
  });
});
