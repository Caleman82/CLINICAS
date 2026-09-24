import Link from "next/link";
import { asignarCarriles, minutosAHora, type Franja } from "@/lib/fechas";
import { ESTADOS_TURNO, type EstadoTurno } from "@/lib/turnos";

export const PX_POR_MIN = 1.6;
const PASO_HUECOS = 30;

export type TurnoGrilla = {
  id: string;
  inicio: number; // minutos desde medianoche (hora local)
  fin: number;
  estado: EstadoTurno;
  paciente: string;
  servicio: string;
  recurso: string | null;
  color: string;
};

export type Columna = {
  clave: string;
  titulo: string;
  subtitulo?: string;
  color?: string;
  franjas: Franja[]; // horario de atención
  bloqueos: { inicio: number; fin: number; motivo: string | null }[];
  turnos: TurnoGrilla[];
  /** URL para crear un turno en ese hueco (sin la hora); null si no se puede agendar. */
  hrefNuevo: string | null;
  esHoy?: boolean;
};

export function Grilla({
  slug,
  rango,
  columnas,
  ahora,
  resaltado,
}: {
  slug: string;
  rango: Franja;
  columnas: Columna[];
  ahora: number | null;
  resaltado?: string;
}) {
  const alto = (rango.fin - rango.inicio) * PX_POR_MIN;
  const horas: number[] = [];
  for (let m = rango.inicio; m < rango.fin; m += 60) horas.push(m);
  const y = (min: number) => (Math.max(min, rango.inicio) - rango.inicio) * PX_POR_MIN;
  const h = (ini: number, fin: number) => Math.max((Math.min(fin, rango.fin) - Math.max(ini, rango.inicio)) * PX_POR_MIN, 0);

  return (
    <div className="overflow-x-auto rounded-[14px] border border-borde bg-superficie">
      <div className="grid min-w-fit" style={{ gridTemplateColumns: `56px repeat(${columnas.length}, minmax(170px, 1fr))` }}>
        {/* Encabezados */}
        <div className="sticky left-0 z-20 border-b border-borde bg-superficie" />
        {columnas.map((c) => (
          <div key={c.clave} className={`border-b border-l border-borde px-3 py-2.5 ${c.esHoy ? "bg-marca-clara" : ""}`}>
            <div className="flex items-center gap-2 font-bold">
              {c.color && <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />}
              <span className="truncate first-letter:uppercase">{c.titulo}</span>
            </div>
            {c.subtitulo && <div className="truncate text-[13px] text-tinta-suave">{c.subtitulo}</div>}
          </div>
        ))}

        {/* Horas */}
        <div className="sticky left-0 z-20 bg-superficie" style={{ height: alto }}>
          {horas.map((m) => (
            <div key={m} className="absolute -translate-y-2 pl-2 text-xs text-tinta-suave" style={{ top: y(m) + (m === rango.inicio ? 8 : 0) }}>
              {minutosAHora(m)}
            </div>
          ))}
        </div>

        {columnas.map((c) => (
          <div key={c.clave} className="relative border-l border-borde bg-fondo-2" style={{ height: alto }}>
            {/* Horario de atención */}
            {c.franjas.map((f, i) => (
              <div key={i} className="absolute inset-x-0 bg-superficie" style={{ top: y(f.inicio), height: h(f.inicio, f.fin) }} />
            ))}
            {/* Líneas de hora */}
            {horas.map((m) => (
              <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-borde/70" style={{ top: y(m) }} />
            ))}
            {/* Huecos para agendar */}
            {c.hrefNuevo &&
              Array.from({ length: Math.ceil((rango.fin - rango.inicio) / PASO_HUECOS) }, (_, i) => rango.inicio + i * PASO_HUECOS).map((m) => (
                <Link
                  key={m}
                  href={`${c.hrefNuevo}&hora=${minutosAHora(m)}`}
                  className="group absolute inset-x-0 flex items-start justify-end px-2 pt-1 text-xs font-semibold text-transparent hover:bg-marca-clara/60 hover:text-marca focus-visible:bg-marca-clara/60 focus-visible:text-marca"
                  style={{ top: y(m), height: PASO_HUECOS * PX_POR_MIN }}
                  aria-label={`Agendar ${c.titulo} a las ${minutosAHora(m)}`}
                >
                  + {minutosAHora(m)}
                </Link>
              ))}
            {/* Bloqueos */}
            {c.bloqueos.map((b, i) => (
              <div
                key={i}
                className="pointer-events-none absolute inset-x-0 z-[5] overflow-hidden border-y border-borde-campo px-2 py-1 text-xs font-semibold text-neutro"
                style={{
                  top: y(b.inicio),
                  height: h(b.inicio, b.fin),
                  background: "repeating-linear-gradient(45deg, #edebe6, #edebe6 6px, #e2e0d9 6px, #e2e0d9 12px)",
                }}
              >
                Bloqueado{b.motivo ? `: ${b.motivo}` : ""}
              </div>
            ))}
            {/* Turnos */}
            {asignarCarriles(c.turnos).map((t) => {
              const e = ESTADOS_TURNO[t.estado];
              const alturaT = h(t.inicio, t.fin);
              return (
                <Link
                  key={t.id}
                  href={`/c/${slug}/turnos/${t.id}`}
                  className={`absolute z-10 flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-[13px] leading-tight shadow-sm hover:z-20 hover:shadow-md ${
                    t.estado === "no_asistio" ? "opacity-60" : ""
                  } ${resaltado === t.id ? "ring-2 ring-tinta ring-offset-1" : ""}`}
                  style={{
                    top: y(t.inicio) + 1,
                    height: Math.max(alturaT - 2, 18),
                    left: `calc(${(t.carril / t.carriles) * 100}% + 3px)`,
                    width: `calc(${100 / t.carriles}% - 6px)`,
                    background: `color-mix(in srgb, ${t.color} 14%, white)`,
                    borderColor: `color-mix(in srgb, ${t.color} 55%, white)`,
                  }}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-bold">{minutosAHora(t.inicio)}</span>
                    <span className={`truncate rounded-full px-1.5 text-[11px] font-bold ${e.clase}`}>{e.etiqueta}</span>
                  </span>
                  <span className="truncate font-semibold">{t.paciente}</span>
                  {alturaT > 52 && (
                    <span className="truncate text-tinta-suave">
                      {t.servicio}
                      {t.recurso ? ` · ${t.recurso}` : ""}
                    </span>
                  )}
                </Link>
              );
            })}
            {/* Hora actual */}
            {c.esHoy && ahora !== null && ahora >= rango.inicio && ahora <= rango.fin && (
              <div className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-error" style={{ top: y(ahora) }}>
                <span className="absolute -top-1.5 -left-1 size-2.5 rounded-full bg-error" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
