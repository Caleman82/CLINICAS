"use server";

import { redirect } from "next/navigation";
import { activarMiembro } from "@/lib/invitaciones";
import { esquemaClave } from "@/lib/validacion";

export type EstadoActivacion = { error?: string };

export async function activar(token: string, _prev: EstadoActivacion, formData: FormData): Promise<EstadoActivacion> {
  const clave = esquemaClave.safeParse(formData.get("clave"));
  if (!clave.success) return { error: clave.error.issues[0].message };
  if (formData.get("clave") !== formData.get("confirmacion")) return { error: "Las contraseñas no coinciden." };

  const r = await activarMiembro(token, clave.data);
  if (!r.ok) return { error: r.error };
  redirect("/ingresar?activada=1");
}
