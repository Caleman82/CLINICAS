import { ESTADOS_TURNO, type EstadoTurno } from "@/lib/turnos";

export function EstadoTurnoInsignia({ estado }: { estado: EstadoTurno }) {
  const e = ESTADOS_TURNO[estado];
  return <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold whitespace-nowrap ${e.clase}`}>{e.etiqueta}</span>;
}
