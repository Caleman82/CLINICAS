import { Client } from "pg";

export function urlBaseTest(): string {
  const url = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres");
  url.pathname = "/clinicas_test";
  return url.toString();
}

/** Conexión privilegiada (dueño de las tablas), para preparar datos. */
export async function conectar(): Promise<Client> {
  const c = new Client({ connectionString: urlBaseTest() });
  await c.connect();
  return c;
}

export type Sesion = { id: string } | "anon" | "service_role";

/**
 * Ejecuta `fn` como lo haría PostgREST para ese usuario: rol `authenticated`
 * con el JWT en request.jwt.claims. Todo corre en una transacción que se
 * revierte al final, así los tests no se contaminan entre sí.
 */
export async function como<T>(db: Client, sesion: Sesion, fn: (q: Consultor) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (sesion === "anon") {
      await db.query("set local role anon");
      await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (sesion === "service_role") {
      await db.query("set local role service_role");
      await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    } else {
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: sesion.id, role: "authenticated" }),
      ]);
    }
    return await fn(new Consultor(db));
  } finally {
    await db.query("rollback");
  }
}

export class Consultor {
  private n = 0;
  constructor(private db: Client) {}

  async filas<R extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.db.query(sql, params)).rows as R[];
  }

  async cuenta(sql: string, params: unknown[] = []): Promise<number> {
    const r = await this.db.query(`select count(*)::int as n from (${sql}) x`, params);
    return r.rows[0].n;
  }

  /** Ejecuta una sentencia y devuelve la cantidad de filas afectadas. */
  async ejecutar(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.db.query(sql, params)).rowCount ?? 0;
  }

  /**
   * Ejecuta una sentencia que se espera que falle. Usa un savepoint para que la
   * transacción siga usable. Devuelve el mensaje de error (o null si no falló).
   */
  async falla(sql: string, params: unknown[] = []): Promise<string | null> {
    const sp = `sp_${++this.n}`;
    await this.db.query(`savepoint ${sp}`);
    try {
      await this.db.query(sql, params);
      await this.db.query(`release savepoint ${sp}`);
      return null;
    } catch (e) {
      await this.db.query(`rollback to savepoint ${sp}`);
      return (e as Error).message;
    }
  }
}
