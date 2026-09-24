import "server-only";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { hoy } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { OpcionesTurno } from "./campos-turno";

/** Opciones para el formulario de turno (solo activos, más los ya usados por el turno que se edita). */
export async function opcionesTurno(clinicaId: string, pacienteId: string, incluir: { profesional?: string; servicio?: string; recurso?: string | null } = {}) {
  const supabase = await crearClienteServidor();
  const [config, paquetes] = await Promise.all([
    cargarConfiguracion(clinicaId),
    supabase.from("paquetes").select("id, servicio_id, sesiones_totales, sesiones_usadas, vence_en").eq("paciente_id", pacienteId),
  ]);
  const opciones: OpcionesTurno = {
    profesionales: config.profesionales.filter((p) => p.activo || p.id === incluir.profesional),
    servicios: config.servicios.filter((s) => s.activo || s.id === incluir.servicio),
    recursos: config.recursos.filter((r) => r.activo || r.id === incluir.recurso),
    paquetes: (paquetes.data ?? []).filter((p) => !p.vence_en || p.vence_en >= hoy()),
  };
  return { opciones, config };
}
