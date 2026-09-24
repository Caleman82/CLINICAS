"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensajeError, type EstadoForm } from "@/lib/errores";
import { obtenerPaciente } from "@/lib/sesion-paciente";
import { crearClienteServidor } from "@/lib/supabase/server";

const FUNCIONES = {
  confirmar: { rpc: "confirmar_mi_turno", ok: "¡Listo! Confirmaste tu turno." },
  reprogramar: { rpc: "pedir_reprogramacion_mi_turno", ok: "Le avisamos a la clínica: se van a comunicar con vos para cambiar el turno." },
  cancelar: { rpc: "cancelar_mi_turno", ok: "Tu turno quedó cancelado." },
} as const;

export async function accionTurno(slug: string, turnoId: string, accion: keyof typeof FUNCIONES): Promise<EstadoForm> {
  const f = FUNCIONES[accion];
  if (!f || !/^[0-9a-f-]{36}$/.test(turnoId)) return { error: "Acción no válida." };
  const r = await obtenerPaciente(slug);
  if (!r?.paciente) return { error: "Tu sesión venció. Volvé a ingresar." };
  // Las reglas (turno propio, estado, plazo, clínica habilitada) las valida la base.
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc(f.rpc, { p_turno: turnoId });
  if (error) return { error: mensajeError(error, "No pudimos hacer el cambio. Probá de nuevo.") };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: f.ok };
}

export async function salirPaciente(slug: string) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect(`/p/${slug}/ingresar`);
}
