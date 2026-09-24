"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitirEnlaceMiembro, invitarMiembro } from "@/lib/invitaciones";
import { exigirClinica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaEmail, esquemaNombre, esquemaRol } from "@/lib/validacion";

export type EstadoEquipo = { error?: string; ok?: string; enlace?: string | null };

const SOLO_LECTURA = "La clínica está en modo solo lectura por un pago pendiente.";

async function exigirAdminConEscritura(slug: string) {
  const r = await exigirClinica(slug, ["admin_clinica"]);
  if (!["activa", "gracia"].includes(r.clinica.estado_suscripcion)) return { ...r, bloqueada: true as const };
  return { ...r, bloqueada: false as const };
}

export async function invitar(slug: string, _prev: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const { ctx, clinica, bloqueada } = await exigirAdminConEscritura(slug);
  if (bloqueada) return { error: SOLO_LECTURA };
  const datos = z
    .object({ nombre: esquemaNombre, email: esquemaEmail, rol: esquemaRol })
    .safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };

  const r = await invitarMiembro({ clinicaId: clinica.clinica_id, ...datos.data, creadoPor: ctx.userId });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/c/${slug}/equipo`);
  return r.enlace
    ? { ok: `${datos.data.nombre} fue agregada/o al equipo. Enviale este enlace:`, enlace: r.enlace }
    : { ok: `${datos.data.nombre} ya tenía cuenta en el sistema: entra con su contraseña de siempre.` };
}

export async function cambiarActivo(slug: string, membresiaId: string, activo: boolean): Promise<EstadoEquipo> {
  const { clinica, bloqueada } = await exigirAdminConEscritura(slug);
  if (bloqueada) return { error: SOLO_LECTURA };
  // Pasa por RLS: solo el admin de esta clínica, y nunca sobre sí mismo.
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("membresias")
    .update({ activo })
    .eq("id", membresiaId)
    .eq("clinica_id", clinica.clinica_id)
    .select("id");
  if (error || !data?.length) return { error: "No se pudo cambiar el acceso." };
  revalidatePath(`/c/${slug}/equipo`);
  return { ok: activo ? "Acceso reactivado." : "Acceso desactivado. Sus sesiones se cerraron." };
}

export async function generarEnlace(slug: string, membresiaId: string): Promise<EstadoEquipo> {
  const { ctx, clinica, bloqueada } = await exigirAdminConEscritura(slug);
  if (bloqueada) return { error: SOLO_LECTURA };
  if (!(await esMiembroDeLaClinica(membresiaId, clinica.clinica_id, ctx.userId))) return { error: "No se encontró el miembro." };
  const r = await emitirEnlaceMiembro({ membresiaId, clinicaId: clinica.clinica_id, creadoPor: ctx.userId });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/c/${slug}/equipo`);
  return { ok: "Enlace generado. El anterior dejó de funcionar.", enlace: r.enlace };
}

/** Verificación con la sesión del usuario (RLS): la membresía es de su clínica y no es la propia. */
async function esMiembroDeLaClinica(membresiaId: string, clinicaId: string, userId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("membresias")
    .select("id")
    .eq("id", membresiaId)
    .eq("clinica_id", clinicaId)
    .neq("user_id", userId)
    .maybeSingle();
  return !!data;
}
