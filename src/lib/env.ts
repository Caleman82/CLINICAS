import "server-only";

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const env = {
  get supabaseUrl() {
    return requerida("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return requerida("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** Solo servidor. Nunca exponer al navegador. */
  get supabaseServiceRoleKey() {
    return requerida("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appUrl() {
    return requerida("APP_URL").replace(/\/$/, "");
  },
};
