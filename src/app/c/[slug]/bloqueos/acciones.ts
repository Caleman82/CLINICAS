"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajeError, type EstadoForm } from "@/lib/errores";
import { aInstante, esFecha } from "@/lib/fechas";
import { autorizarEscritura, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida.");
const esquema = z.object({
  objetivo: z.string().regex(/^(p|r):[0-9a-f-]{36}$/, "Elegí un profesional o un recurso."),
  desde_fecha: z.string().refine(esFecha, "Fecha de inicio no válida."),
  desde_hora: hora,
  hasta_fecha: z.string().refine(esFecha, "Fecha de fin no válida."),
  hasta_hora: hora,
  motivo: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

export async function crearBloqueo(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const d = esquema.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const desde = aInstante(d.data.desde_fecha, d.data.desde_hora);
  const hasta = aInstante(d.data.hasta_fecha, d.data.hasta_hora);
  if (hasta <= desde) return { error: "El fin del bloqueo debe ser posterior al inicio." };
  const [tipo, id] = d.data.objetivo.split(":");

  const supabase = await crearClienteServidor();
  // Aviso si ya hay turnos en ese período (no se cancelan solos).
  let q = supabase
    .from("turnos")
    .select("id", { count: "exact", head: true })
    .eq("clinica_id", a.clinica.clinica_id)
    .neq("estado", "cancelado")
    .lt("inicio", hasta.toISOString())
    .gt("fin", desde.toISOString());
  q = tipo === "p" ? q.eq("profesional_id", id) : q.eq("recurso_id", id);
  const { count } = await q;

  const { error } = await supabase.from("bloqueos_agenda").insert({
    clinica_id: a.clinica.clinica_id,
    profesional_id: tipo === "p" ? id : null,
    recurso_id: tipo === "r" ? id : null,
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    motivo: d.data.motivo,
  });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return count
    ? { ok: `Bloqueo creado. Atención: hay ${count} ${count === 1 ? "turno" : "turnos"} en ese período que no se cancelaron; revisalos en la agenda.` }
    : { ok: "Bloqueo creado." };
}

export async function borrarBloqueo(slug: string, id: string, _prev: EstadoForm): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("bloqueos_agenda").delete().eq("id", id).eq("clinica_id", a.clinica.clinica_id);
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/c/${slug}`, "layout");
  return {};
}
