import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { cargarFixture } from "./fixture";
import { urlBaseTest } from "./helpers";

// Crea una base de test limpia y aplica el shim de Supabase + todas las migraciones.
export default async function setup() {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";
  const dbName = "clinicas_test";

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const db = new Client({ connectionString: urlBaseTest() });
  await db.connect();
  const root = join(__dirname, "..", "..", "supabase");
  await db.query(readFileSync(join(root, "tests", "supabase_shim.sql"), "utf8"));
  const migraciones = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const archivo of migraciones) {
    try {
      await db.query(readFileSync(join(root, "migrations", archivo), "utf8"));
    } catch (e) {
      throw new Error(`Falló la migración ${archivo}: ${(e as Error).message}`);
    }
  }
  await cargarFixture(db);
  await db.end();
}
