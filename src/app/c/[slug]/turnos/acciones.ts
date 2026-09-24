"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cargarConfiguracion, type Horario } from "@/lib/datos-clinica";
import { mensajeError, type EstadoForm } from "@/lib/errores";
import { aInstante, dentroDeHorario, esFecha, horaAMinutos, minutosAHora, nombreDia, partesLocales } from "@/lib/fechas";
import { autorizarEscritura, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ESTADOS_PROFESIONAL, esEstadoTurno, TRANSICIONES, type EstadoTurno } from "@/lib/turnos";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/, "Falta un dato.");
const uuidOpcional = z
  .string()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || v === "auto" || /^[0-9a-f-]{36}$/.test(v), "Valor no válido.");

const esquemaHorario = z.object({
  profesional_id: uuid,
  servicio_id: uuid,
  fecha: z.string().refine(esFecha, "La fecha no es válida."),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora no es válida."),
  duracion_min: z.coerce.number().int().min(5, "Duración mínima: 5 minutos.").max(720, "Duración máxima: 12 horas."),
  recurso_id: uuidOpcional,
  paquete_id: uuidOpcional,
  notas_internas: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || null),
  fuera_horario: z.preprocess((v) => v === "on", z.boolean()),
});

type DatosHorario = z.infer<typeof esquemaHorario>;

function describirHorario(horarios: Horario[]): string {
  if (!horarios.length) return "sin horario ese día";
  return horarios.map((h) => `${h.hora_inicio}–${h.hora_fin}`).join(", ");
}

/**
 * Validaciones previas que dependen de la configuración: horario de atención y
 * elección automática de recurso. La superposición, bloqueos, tipo de recurso y
 * paquetes los controla la base (y devuelve el error si algo no corresponde).
 */
async function prepararTurno(clinicaId: string, d: DatosHorario, excluirTurno?: string) {
  const inicio = aInstante(d.fecha, d.hora);
  const fin = new Date(inicio.getTime() + d.duracion_min * 60_000);
  if (partesLocales(fin).fecha !== d.fecha) return { error: "El turno no puede pasar de la medianoche." } as const;

  const config = await cargarConfiguracion(clinicaId);
  const prof = config.profesionales.find((p) => p.id === d.profesional_id);
  const serv = config.servicios.find((s) => s.id === d.servicio_id);
  if (!prof || !serv) return { error: "El profesional o el servicio no existen." } as const;

  // Horario de atención (solo si el profesional tiene horarios cargados).
  const susHorarios = config.horarios.filter((h) => h.profesional_id === prof.id);
  if (susHorarios.length && !d.fuera_horario) {
    const delDia = susHorarios.filter((h) => h.dia_semana === partesLocales(inicio).diaSemana);
    const ini = horaAMinutos(d.hora);
    const franjas = delDia.map((h) => ({ inicio: horaAMinutos(h.hora_inicio), fin: horaAMinutos(h.hora_fin) }));
    if (!dentroDeHorario(ini, ini + d.duracion_min, franjas)) {
      return {
        error: `El turno (${d.hora}–${minutosAHora(ini + d.duracion_min)}) está fuera del horario de ${prof.nombre_visible} el ${nombreDia(partesLocales(inicio).diaSemana)} (${describirHorario(delDia)}). Si igual querés agendarlo, marcá "Agendar fuera del horario".`,
      } as const;
    }
  }

  // Recurso: "auto" (o vacío si el servicio lo requiere) elige el primero libre del tipo.
  let recursoId = d.recurso_id === "auto" ? null : d.recurso_id;
  if (!recursoId && serv.requiere_recurso_tipo) {
    const candidatos = config.recursos.filter((r) => r.activo && r.tipo === serv.requiere_recurso_tipo);
    if (!candidatos.length) return { error: `No hay recursos activos de tipo "${serv.requiere_recurso_tipo}".` } as const;
    const supabase = await crearClienteServidor();
    const ids = candidatos.map((c) => c.id);
    let ocupados = supabase
      .from("turnos")
      .select("recurso_id")
      .in("recurso_id", ids)
      .neq("estado", "cancelado")
      .lt("inicio", fin.toISOString())
      .gt("fin", inicio.toISOString());
    if (excluirTurno) ocupados = ocupados.neq("id", excluirTurno);
    const [t, b] = await Promise.all([
      ocupados,
      supabase.from("bloqueos_agenda").select("recurso_id").in("recurso_id", ids).lt("desde", fin.toISOString()).gt("hasta", inicio.toISOString()),
    ]);
    const noLibres = new Set([...(t.data ?? []), ...(b.data ?? [])].map((x) => x.recurso_id));
    const libre = candidatos.find((c) => !noLibres.has(c.id));
    if (!libre) return { error: `No hay ningún recurso de tipo "${serv.requiere_recurso_tipo}" libre en ese horario.` } as const;
    recursoId = libre.id;
  }

  return {
    fila: {
      profesional_id: d.profesional_id,
      servicio_id: d.servicio_id,
      recurso_id: recursoId,
      paquete_id: d.paquete_id === "auto" ? null : d.paquete_id,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      notas_internas: d.notas_internas,
    },
  } as const;
}

export async function crearTurno(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const paciente = uuid.safeParse(fd.get("paciente_id"));
  if (!paciente.success) return { error: "Elegí el paciente." };
  const d = esquemaHorario.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };

  const prep = await prepararTurno(a.clinica.clinica_id, d.data);
  if ("error" in prep) return { error: prep.error };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("turnos")
    .insert({ ...prep.fila, paciente_id: paciente.data, clinica_id: a.clinica.clinica_id })
    .select("id")
    .single();
  if (error) return { error: mensajeError(error, "No se pudo agendar el turno.") };
  revalidatePath(`/c/${slug}`, "layout");
  redirect(`/c/${slug}?fecha=${d.data.fecha}&turno=${data.id}`);
}

export async function moverTurno(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const d = esquemaHorario.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };

  const prep = await prepararTurno(a.clinica.clinica_id, d.data, id);
  if ("error" in prep) return { error: prep.error };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("turnos")
    .update(prep.fila)
    .eq("id", id)
    .eq("clinica_id", a.clinica.clinica_id)
    .in("estado", ["agendado", "confirmado", "reprogramar_solicitado"])
    .select("id");
  if (error) return { error: mensajeError(error, "No se pudo mover el turno.") };
  if (!data.length) return { error: "Solo se pueden modificar turnos agendados o confirmados." };
  revalidatePath(`/c/${slug}`, "layout");
  return { ok: "Turno actualizado." };
}

export async function cambiarEstadoTurno(slug: string, id: string, estado: string, _prev: EstadoForm): Promise<EstadoForm> {
  if (!esEstadoTurno(estado)) return { error: "Estado no válido." };
  // Profesionales también: la base solo les deja cambiar sus propios turnos.
  const a = await autorizarEscritura(slug, ["admin_clinica", "recepcion", "profesional"]);
  if (!a.ok) return { error: a.error };
  if (a.clinica.rol === "profesional" && !ESTADOS_PROFESIONAL.includes(estado)) {
    return { error: "Cancelar o reagendar turnos lo hace recepción." };
  }

  const supabase = await crearClienteServidor();
  const { data: actual } = await supabase.from("turnos").select("estado").eq("id", id).eq("clinica_id", a.clinica.clinica_id).maybeSingle();
  if (!actual) return { error: "No se encontró el turno." };
  if (!TRANSICIONES[actual.estado as EstadoTurno].includes(estado)) return { error: "Ese cambio de estado no está permitido." };

  const { data, error } = await supabase
    .from("turnos")
    .update({ estado })
    .eq("id", id)
    .eq("clinica_id", a.clinica.clinica_id)
    .eq("estado", actual.estado)
    .select("id");
  if (error) return { error: mensajeError(error, "No se pudo cambiar el estado.") };
  if (!data.length) return { error: "El turno cambió mientras tanto. Recargá la página." };
  revalidatePath(`/c/${slug}`, "layout");
  return {};
}
