"use client";

import { useState, useTransition } from "react";
import { Mensaje } from "@/components/ui";
import type { EstadoForm } from "@/lib/errores";
import { accionTurno } from "./acciones";

export type TurnoPaciente = {
  id: string;
  inicio: string;
  estado: string;
  servicio: string;
  profesional: string;
  indicaciones_previas: string | null;
  puede_cancelar: boolean;
  horas_limite_cancelacion: number;
  cancelable_hasta: string;
  cancelado_por_paciente: boolean;
  fecha: string; // ya formateada
  hora: string;
  limite: string; // fecha y hora límite para cancelar, formateada
};

const ETIQUETAS: Record<string, { texto: string; clase: string }> = {
  agendado: { texto: "Sin confirmar", clase: "bg-neutro-claro text-neutro" },
  confirmado: { texto: "Confirmado", clase: "bg-marca-clara text-marca-oscura" },
  reprogramar_solicitado: { texto: "Pediste cambiarlo", clase: "bg-alerta-clara text-alerta" },
  en_sala: { texto: "En sala", clase: "bg-marca-clara text-marca-oscura" },
  atendido: { texto: "Atendido", clase: "bg-neutro-claro text-neutro" },
  cancelado: { texto: "Cancelado", clase: "bg-neutro-claro text-neutro" },
  no_asistio: { texto: "No asististe", clase: "bg-neutro-claro text-neutro" },
};

function Candado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Tarjeta de un turno con las acciones del paciente. */
export function Turno({ slug, t, destacado = false, acciones = true }: { slug: string; t: TurnoPaciente; destacado?: boolean; acciones?: boolean }) {
  const [estado, setEstado] = useState<EstadoForm>({});
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (accion: "confirmar" | "reprogramar" | "cancelar") => {
    if (accion === "cancelar" && !confirm("¿Seguro que querés cancelar este turno? El horario queda libre para otra persona.")) return;
    iniciar(async () => setEstado(await accionTurno(slug, t.id, accion)));
  };
  const e = ETIQUETAS[t.estado] ?? ETIQUETAS.agendado;
  const activo = ["agendado", "confirmado", "reprogramar_solicitado"].includes(t.estado);
  const boton = "h-12 rounded-[10px] px-4 text-[15px] font-semibold disabled:opacity-60";

  return (
    <article className={`flex flex-col gap-4 rounded-[14px] border bg-superficie p-5 ${destacado ? "border-marca" : "border-borde"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-tinta-suave first-letter:uppercase">{t.fecha}</span>
          <span className={`font-display font-semibold ${destacado ? "text-4xl" : "text-2xl"}`}>{t.hora}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold whitespace-nowrap ${e.clase}`}>
          {t.estado === "cancelado" && t.cancelado_por_paciente ? "Lo cancelaste" : e.texto}
        </span>
      </div>
      <div className="text-[15px]">
        <div className="font-semibold">{t.servicio}</div>
        <div className="text-tinta-suave">{t.profesional}</div>
      </div>
      {destacado && t.indicaciones_previas && activo && (
        <div className="rounded-xl bg-fondo p-4 text-[15px] leading-relaxed">
          <div className="mb-1 text-sm font-bold">Antes de tu turno</div>
          <p className="whitespace-pre-wrap">{t.indicaciones_previas}</p>
        </div>
      )}
      {estado.ok && <Mensaje tipo="exito">{estado.ok}</Mensaje>}
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {acciones && activo && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {t.estado !== "confirmado" && (
              <button type="button" disabled={pendiente} onClick={() => ejecutar("confirmar")} className={`${boton} bg-marca text-white hover:bg-marca-oscura`}>
                Confirmo
              </button>
            )}
            {t.estado !== "reprogramar_solicitado" && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => ejecutar("reprogramar")}
                className={`${boton} border border-borde-campo bg-superficie text-tinta hover:bg-fondo`}
              >
                Necesito reprogramar
              </button>
            )}
          </div>
          {t.puede_cancelar ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={pendiente}
                onClick={() => ejecutar("cancelar")}
                className={`${boton} border border-borde-campo bg-superficie text-alerta hover:bg-alerta-clara`}
              >
                Cancelar turno
              </button>
              <p className="text-[13px] text-tinta-suave">Podés cancelarlo hasta el {t.limite}.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled
                aria-describedby={`fuera-${t.id}`}
                className={`${boton} flex items-center justify-center gap-2 border border-borde bg-neutro-claro text-neutro`}
              >
                <Candado /> Cancelar turno
              </button>
              <p id={`fuera-${t.id}`} className="rounded-xl bg-alerta-clara px-4 py-3 text-[14px] leading-snug text-alerta">
                Estás fuera de las horas posibles para cancelar: los turnos se pueden cancelar hasta{" "}
                {t.horas_limite_cancelacion} horas antes. Comunicate con la clínica.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
