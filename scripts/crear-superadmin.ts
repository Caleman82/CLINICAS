/**
 * Crea (o promueve) un usuario superadmin de Caleman Creativa.
 * Uso: SUPERADMIN_EMAIL=alguien@calemancreativa.com npm run crear-superadmin
 * Pide la contraseña por consola (no queda en el historial ni en archivos).
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno (.env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

async function pedirClave(pregunta: string): Promise<string> {
  let silenciar = false;
  const salida = new Writable({
    write(chunk, _enc, cb) {
      if (!silenciar) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: salida, terminal: true });
  return new Promise((resolve) => {
    rl.question(pregunta, (r) => {
      rl.close();
      process.stdout.write("\n");
      resolve(r);
    });
    silenciar = true;
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!url || !clave || !email) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o SUPERADMIN_EMAIL.");

  const admin = createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } });
  const existente = await admin.rpc("srv_usuario_por_email", { p_email: email });
  if (existente.error) throw existente.error;
  let userId = existente.data as string | null;

  if (!userId) {
    const password = await pedirClave("Contraseña (mín. 12 caracteres, con números): ");
    if (password.length < 12 || !/[0-9]/.test(password)) throw new Error("Contraseña demasiado débil.");
    const creado = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (creado.error) throw creado.error;
    userId = creado.data.user.id;
  }

  const r = await admin.from("plataforma_admins").upsert({ user_id: userId });
  if (r.error) throw r.error;
  console.log(`Listo: ${email} es superadmin.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
