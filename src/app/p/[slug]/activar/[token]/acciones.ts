"use server";

import { redirect } from "next/navigation";
import { activarPaciente } from "@/lib/invitaciones-paciente";
import { esquemaClave } from "@/lib/validacion";

export type EstadoActivacionPaciente = { error?: string };

export async function activarCuentaPaciente(slug: string, token: string, _prev: EstadoActivacionPaciente, fd: FormData): Promise<EstadoActivacionPaciente> {
  const clave = esquemaClave.safeParse(fd.get("clave"));
  if (!clave.success) return { error: clave.error.issues[0].message };
  if (fd.get("clave") !== fd.get("confirmacion")) return { error: "Las contraseñas no coinciden." };
  const r = await activarPaciente(slug, token, clave.data);
  if (!r.ok) return { error: r.error };
  redirect(`/p/${slug}/ingresar?activada=1`);
}
