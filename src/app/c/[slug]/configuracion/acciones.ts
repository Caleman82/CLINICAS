"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeError, type EstadoForm } from "@/lib/errores";
import { horaAMinutos } from "@/lib/fechas";
import { OPCIONES_LIMITE_CANCELACION } from "@/lib/turnos";
import { autorizarEscritura } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const ADMIN = ["admin_clinica"] as const;

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Elegí un color válido.");
const uuidOpcional = z
  .string()
  .transform((v) => v || null)
  .refine((v) => v === null || /^[0-9a-f-]{36}$/.test(v), "Valor no válido.");
const casilla = z.preprocess((v) => v === "on", z.boolean());
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora no válida.");

async function autorizar(slug: string) {
  return autorizarEscritura(slug, [...ADMIN]);
}

function refrescar(slug: string) {
  revalidatePath(`/c/${slug}`, "layout");
}

// ---------------------------------------------------------------------------
// Profesionales
// ---------------------------------------------------------------------------
const esquemaProfesional = z.object({
  nombre_visible: z.string().trim().min(2, "Ingresá el nombre a mostrar.").max(120),
  especialidad: texto(120),
  color_agenda: color,
  user_id: uuidOpcional,
});

export async function crearProfesional(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaProfesional.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("profesionales")
    .insert({ ...d.data, clinica_id: a.clinica.clinica_id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Ese usuario ya está vinculado a otra ficha de profesional." };
    return { error: mensajeError(error) };
  }
  refrescar(slug);
  redirect(`/c/${slug}/configuracion/profesionales/${data.id}?nuevo=1`);
}

export async function editarProfesional(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaProfesional.extend({ activo: casilla }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("profesionales")
    .update(d.data)
    .eq("id", id)
    .eq("clinica_id", a.clinica.clinica_id)
    .select("id");
  if (error) {
    if (error.code === "23505") return { error: "Ese usuario ya está vinculado a otra ficha de profesional." };
    return { error: mensajeError(error) };
  }
  if (!data.length) return { error: "No se encontró el profesional." };
  refrescar(slug);
  return { ok: "Cambios guardados." };
}

export async function guardarServiciosDeProfesional(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const ids = fd.getAll("servicio").map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
  const supabase = await crearClienteServidor();
  const borrado = await supabase.from("servicio_profesional").delete().eq("profesional_id", id).eq("clinica_id", a.clinica.clinica_id);
  if (borrado.error) return { error: mensajeError(borrado.error) };
  if (ids.length) {
    const alta = await supabase
      .from("servicio_profesional")
      .insert(ids.map((servicio_id) => ({ servicio_id, profesional_id: id, clinica_id: a.clinica.clinica_id })));
    if (alta.error) return { error: mensajeError(alta.error) };
  }
  refrescar(slug);
  return { ok: "Servicios actualizados." };
}

export async function agregarHorario(slug: string, profesionalId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const dias = fd
    .getAll("dia")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const h = z.object({ hora_inicio: hora, hora_fin: hora }).safeParse(Object.fromEntries(fd));
  if (!h.success) return { error: h.error.issues[0].message };
  if (!dias.length) return { error: "Elegí al menos un día." };
  const ini = horaAMinutos(h.data.hora_inicio);
  const fin = horaAMinutos(h.data.hora_fin);
  if (fin <= ini) return { error: "La hora de fin debe ser posterior a la de inicio." };

  const supabase = await crearClienteServidor();
  const { data: existentes } = await supabase
    .from("horarios_profesional")
    .select("dia_semana, hora_inicio, hora_fin")
    .eq("profesional_id", profesionalId)
    .in("dia_semana", dias);
  const choca = (existentes ?? []).some((e) => horaAMinutos(e.hora_inicio.slice(0, 5)) < fin && horaAMinutos(e.hora_fin.slice(0, 5)) > ini);
  if (choca) return { error: "Ese horario se superpone con otro ya cargado para alguno de los días." };

  const { error } = await supabase.from("horarios_profesional").insert(
    dias.map((dia_semana) => ({
      clinica_id: a.clinica.clinica_id,
      profesional_id: profesionalId,
      dia_semana,
      hora_inicio: h.data.hora_inicio,
      hora_fin: h.data.hora_fin,
    })),
  );
  if (error) return { error: mensajeError(error) };
  refrescar(slug);
  return { ok: "Horario agregado." };
}

export async function borrarHorario(slug: string, id: string, _prev: EstadoForm): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("horarios_profesional").delete().eq("id", id).eq("clinica_id", a.clinica.clinica_id);
  if (error) return { error: mensajeError(error) };
  refrescar(slug);
  return {};
}

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------
const esquemaServicio = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre del servicio.").max(120),
  duracion_min: z.coerce.number().int("La duración debe ser en minutos enteros.").min(5, "Duración mínima: 5 minutos.").max(720),
  precio: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "El precio no es válido."),
  requiere_recurso_tipo: texto(60),
  indicaciones_previas: texto(2000),
});

export async function crearServicio(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaServicio.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("servicios").insert({ ...d.data, clinica_id: a.clinica.clinica_id });
  if (error) return { error: mensajeError(error) };
  refrescar(slug);
  return { ok: `Servicio "${d.data.nombre}" creado.` };
}

export async function editarServicio(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaServicio.extend({ activo: casilla }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("servicios").update(d.data).eq("id", id).eq("clinica_id", a.clinica.clinica_id).select("id");
  if (error) return { error: mensajeError(error) };
  if (!data.length) return { error: "No se encontró el servicio." };
  refrescar(slug);
  return { ok: "Cambios guardados." };
}

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------
const esquemaRecurso = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre del recurso.").max(120),
  tipo: z.string().trim().toLowerCase().min(1, "Ingresá el tipo de recurso.").max(60),
});

export async function crearRecurso(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaRecurso.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("recursos").insert({ ...d.data, clinica_id: a.clinica.clinica_id });
  if (error) return { error: mensajeError(error) };
  refrescar(slug);
  return { ok: `Recurso "${d.data.nombre}" creado.` };
}

export async function editarRecurso(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const d = esquemaRecurso.extend({ activo: casilla }).safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("recursos").update(d.data).eq("id", id).eq("clinica_id", a.clinica.clinica_id).select("id");
  if (error) return { error: mensajeError(error) };
  if (!data.length) return { error: "No se encontró el recurso." };
  refrescar(slug);
  return { ok: "Guardado." };
}

// ---------------------------------------------------------------------------
// Política de turnos
// ---------------------------------------------------------------------------
export async function guardarLimiteCancelacion(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizar(slug);
  if (!a.ok) return { error: a.error };
  const horas = Number(fd.get("horas_limite_cancelacion"));
  if (!OPCIONES_LIMITE_CANCELACION.includes(horas)) return { error: "Elegí una de las opciones." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clinicas")
    .update({ horas_limite_cancelacion: horas })
    .eq("id", a.clinica.clinica_id)
    .select("id");
  if (error) return { error: mensajeError(error) };
  if (!data.length) return { error: "No se pudo guardar." };
  refrescar(slug);
  return { ok: `Listo: los pacientes pueden cancelar desde la app hasta ${horas} horas antes del turno.` };
}
