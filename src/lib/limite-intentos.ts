import "server-only";
import { headers } from "next/headers";
import { crearClienteAdmin } from "@/lib/supabase/admin";

const VENTANA_MIN = 15;
const MAX_FALLOS_POR_USUARIO = 5;
const MAX_FALLOS_POR_IP = 20;

export async function ipCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocida";
}

/** ¿Está bloqueado temporalmente este identificador o esta IP por demasiados fallos? */
export async function estaBloqueado(identificador: string, ip: string): Promise<boolean> {
  const admin = crearClienteAdmin();
  const desde = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();
  const [porUsuario, porIp] = await Promise.all([
    admin
      .from("intentos_login")
      .select("id", { count: "exact", head: true })
      .eq("identificador", identificador)
      .eq("exito", false)
      .gte("creado_en", desde),
    admin
      .from("intentos_login")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("exito", false)
      .gte("creado_en", desde),
  ]);
  if (porUsuario.error || porIp.error) {
    // Ante la duda, no dejamos pasar.
    return true;
  }
  return (porUsuario.count ?? 0) >= MAX_FALLOS_POR_USUARIO || (porIp.count ?? 0) >= MAX_FALLOS_POR_IP;
}

export async function registrarIntento(identificador: string, ip: string, exito: boolean) {
  await crearClienteAdmin().from("intentos_login").insert({ identificador, ip, exito });
}

export const MENSAJE_BLOQUEO = `Demasiados intentos fallidos. Esperá ${VENTANA_MIN} minutos y probá de nuevo.`;
