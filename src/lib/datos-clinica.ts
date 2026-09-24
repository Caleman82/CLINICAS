import "server-only";
import { crearClienteServidor } from "@/lib/supabase/server";

export type Profesional = {
  id: string;
  nombre_visible: string;
  especialidad: string | null;
  color_agenda: string;
  activo: boolean;
  user_id: string | null;
  servicios: string[];
};
export type Servicio = {
  id: string;
  nombre: string;
  duracion_min: number;
  precio: number | null;
  requiere_recurso_tipo: string | null;
  indicaciones_previas: string | null;
  activo: boolean;
};
export type Recurso = { id: string; nombre: string; tipo: string; activo: boolean };
export type Horario = { id: string; profesional_id: string; dia_semana: number; hora_inicio: string; hora_fin: string };

/** Configuración de la clínica visible para el usuario (pasa por RLS). */
export async function cargarConfiguracion(clinicaId: string) {
  const supabase = await crearClienteServidor();
  const [prof, serv, rec, hor, sp] = await Promise.all([
    supabase.from("profesionales").select("id, nombre_visible, especialidad, color_agenda, activo, user_id").eq("clinica_id", clinicaId).order("nombre_visible"),
    supabase.from("servicios").select("id, nombre, duracion_min, precio, requiere_recurso_tipo, indicaciones_previas, activo").eq("clinica_id", clinicaId).order("nombre"),
    supabase.from("recursos").select("id, nombre, tipo, activo").eq("clinica_id", clinicaId).order("tipo").order("nombre"),
    supabase.from("horarios_profesional").select("id, profesional_id, dia_semana, hora_inicio, hora_fin").eq("clinica_id", clinicaId).order("dia_semana").order("hora_inicio"),
    supabase.from("servicio_profesional").select("servicio_id, profesional_id").eq("clinica_id", clinicaId),
  ]);
  const serviciosPorProfesional = new Map<string, string[]>();
  for (const r of sp.data ?? []) {
    serviciosPorProfesional.set(r.profesional_id, [...(serviciosPorProfesional.get(r.profesional_id) ?? []), r.servicio_id]);
  }
  return {
    profesionales: (prof.data ?? []).map((p) => ({ ...p, servicios: serviciosPorProfesional.get(p.id) ?? [] })) as Profesional[],
    servicios: (serv.data ?? []) as Servicio[],
    recursos: (rec.data ?? []) as Recurso[],
    horarios: ((hor.data ?? []) as Horario[]).map((h) => ({ ...h, hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5) })),
  };
}

/** Fichas de profesional vinculadas al usuario actual en la clínica. */
export async function misProfesionales(clinicaId: string, userId: string): Promise<string[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("profesionales").select("id").eq("clinica_id", clinicaId).eq("user_id", userId);
  return (data ?? []).map((p) => p.id);
}
