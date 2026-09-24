export type EstadoTurno =
  | "agendado"
  | "confirmado"
  | "en_sala"
  | "atendido"
  | "cancelado"
  | "no_asistio"
  | "reprogramar_solicitado";

export const ESTADOS_TURNO: Record<EstadoTurno, { etiqueta: string; clase: string }> = {
  agendado: { etiqueta: "Agendado", clase: "bg-neutro-claro text-neutro" },
  confirmado: { etiqueta: "Confirmado", clase: "bg-marca-clara text-marca-oscura" },
  en_sala: { etiqueta: "En sala", clase: "bg-[#e3e9f7] text-[#28407a]" },
  atendido: { etiqueta: "Atendido", clase: "bg-tinta text-white" },
  cancelado: { etiqueta: "Cancelado", clase: "bg-neutro-claro text-neutro line-through" },
  no_asistio: { etiqueta: "No asistió", clase: "bg-error-claro text-error" },
  reprogramar_solicitado: { etiqueta: "Pide reprogramar", clase: "bg-alerta-clara text-alerta" },
};

/** Estados a los que se puede pasar desde cada estado (flujo del día a día). */
export const TRANSICIONES: Record<EstadoTurno, EstadoTurno[]> = {
  agendado: ["confirmado", "en_sala", "atendido", "no_asistio", "cancelado"],
  confirmado: ["en_sala", "atendido", "no_asistio", "agendado", "cancelado"],
  reprogramar_solicitado: ["confirmado", "agendado", "cancelado"],
  en_sala: ["atendido", "confirmado"],
  atendido: ["en_sala"],
  no_asistio: ["agendado"],
  cancelado: ["agendado"],
};

export const ETIQUETA_ACCION: Record<EstadoTurno, string> = {
  agendado: "Volver a agendado",
  confirmado: "Confirmar",
  en_sala: "En sala",
  atendido: "Atendido",
  no_asistio: "No asistió",
  cancelado: "Cancelar turno",
  reprogramar_solicitado: "Pide reprogramar",
};

export function esEstadoTurno(v: string): v is EstadoTurno {
  return v in ESTADOS_TURNO;
}

/** Cambios de estado que puede hacer un profesional sobre sus turnos (cancelar o reagendar es de recepción). */
export const ESTADOS_PROFESIONAL: EstadoTurno[] = ["confirmado", "en_sala", "atendido", "no_asistio"];

/** Opciones de plazo para que el paciente cancele desde la app (horas antes del turno). */
export const OPCIONES_LIMITE_CANCELACION = [24, 48, 72];

/** Momento límite para que el paciente cancele (misma regla que app.cancelable_hasta en la base). */
export function cancelableHasta(inicio: string | Date, horas: number): Date {
  return new Date(new Date(inicio).getTime() - horas * 3600_000);
}
