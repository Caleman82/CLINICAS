import "server-only";
import { fechaLarga, partesLocales } from "@/lib/fechas";
import { formatoFecha } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { TurnoPaciente } from "./turno";

type Fila = Omit<TurnoPaciente, "fecha" | "hora" | "limite"> & { clinica_id: string; fin: string };

/** Turnos del paciente (vía mis_turnos(): sin datos internos), con fechas en hora local. */
export async function misTurnos(clinicaId: string): Promise<TurnoPaciente[]> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("mis_turnos");
  return ((data ?? []) as Fila[])
    .filter((t) => t.clinica_id === clinicaId)
    .map((t) => {
      const l = partesLocales(t.inicio);
      const lim = partesLocales(t.cancelable_hasta);
      return { ...t, fecha: fechaLarga(l.fecha), hora: l.hora, limite: `${formatoFecha(lim.fecha)} a las ${lim.hora}` };
    });
}

export const ESTADOS_PROXIMOS = ["agendado", "confirmado", "reprogramar_solicitado", "en_sala"];
