import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente con service_role: SALTEA RLS. Usar solo en el servidor y solo después
 * de verificar explícitamente los permisos del usuario que hace la operación.
 */
export function crearClienteAdmin(actorId?: string) {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Quién pidió la operación, para la auditoría (la base solo lo acepta con service_role).
    global: actorId ? { headers: { "x-actor-id": actorId } } : undefined,
  });
}
