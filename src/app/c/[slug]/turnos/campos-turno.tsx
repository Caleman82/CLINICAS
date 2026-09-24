"use client";

import { useMemo, useState } from "react";
import { AreaTexto, Campo, Casilla, Selector } from "@/components/ui";

export type OpcionesTurno = {
  profesionales: { id: string; nombre_visible: string; servicios: string[] }[];
  servicios: { id: string; nombre: string; duracion_min: number; requiere_recurso_tipo: string | null }[];
  recursos: { id: string; nombre: string; tipo: string }[];
  paquetes: { id: string; servicio_id: string; sesiones_totales: number; sesiones_usadas: number; vence_en: string | null }[];
};

export type ValoresTurno = {
  profesional_id?: string;
  servicio_id?: string;
  fecha?: string;
  hora?: string;
  duracion_min?: number;
  recurso_id?: string | null;
  paquete_id?: string | null;
  notas_internas?: string | null;
};

/**
 * Campos del turno. Al elegir el servicio se sugiere su duración y se filtran los
 * profesionales que lo realizan y los recursos del tipo que requiere.
 */
export function CamposTurno({ opciones, valores = {} }: { opciones: OpcionesTurno; valores?: ValoresTurno }) {
  const [servicioId, setServicioId] = useState(valores.servicio_id ?? "");
  const [profesionalId, setProfesionalId] = useState(valores.profesional_id ?? "");
  const [duracion, setDuracion] = useState(String(valores.duracion_min ?? ""));
  const servicio = opciones.servicios.find((s) => s.id === servicioId);

  const profesionales = useMemo(() => {
    if (!servicioId) return opciones.profesionales;
    const conServicio = opciones.profesionales.filter((p) => p.servicios.includes(servicioId));
    // Si nadie tiene el servicio asignado, lo puede hacer cualquiera (misma regla que la base).
    const nadieAsignado = !opciones.profesionales.some((p) => p.servicios.includes(servicioId));
    return nadieAsignado ? opciones.profesionales : conServicio;
  }, [opciones.profesionales, servicioId]);

  const recursos = servicio?.requiere_recurso_tipo
    ? opciones.recursos.filter((r) => r.tipo === servicio.requiere_recurso_tipo)
    : opciones.recursos;
  const paquetes = opciones.paquetes.filter((p) => p.servicio_id === servicioId && p.sesiones_usadas < p.sesiones_totales);
  const profesionalValido = !profesionalId || profesionales.some((p) => p.id === profesionalId);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Selector
        id="servicio_id"
        name="servicio_id"
        etiqueta="Servicio"
        required
        value={servicioId}
        onChange={(e) => {
          setServicioId(e.target.value);
          const s = opciones.servicios.find((x) => x.id === e.target.value);
          if (s) setDuracion(String(s.duracion_min));
        }}
      >
        <option value="" disabled>
          Elegí un servicio
        </option>
        {opciones.servicios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre} ({s.duracion_min} min)
          </option>
        ))}
      </Selector>
      <Selector
        id="profesional_id"
        name="profesional_id"
        etiqueta="Profesional"
        required
        value={profesionalValido ? profesionalId : ""}
        onChange={(e) => setProfesionalId(e.target.value)}
      >
        <option value="" disabled>
          Elegí un profesional
        </option>
        {profesionales.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre_visible}
          </option>
        ))}
      </Selector>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Campo id="fecha" name="fecha" etiqueta="Fecha" type="date" defaultValue={valores.fecha} required />
        <Campo id="hora" name="hora" etiqueta="Hora" type="time" step={300} defaultValue={valores.hora} required />
        <Campo
          id="duracion_min"
          name="duracion_min"
          etiqueta="Duración (min)"
          type="number"
          min={5}
          max={720}
          step={5}
          value={duracion}
          onChange={(e) => setDuracion(e.target.value)}
          required
        />
      </div>
      <Selector id="recurso_id" name="recurso_id" etiqueta="Recurso" defaultValue={valores.recurso_id ?? (servicio?.requiere_recurso_tipo ? "auto" : "")} key={`r-${servicioId}`}>
        {servicio?.requiere_recurso_tipo ? (
          <option value="auto">Asignar un {servicio.requiere_recurso_tipo} libre</option>
        ) : (
          <option value="">Sin recurso</option>
        )}
        {recursos.map((r) => (
          <option key={r.id} value={r.id}>
            {r.nombre}
          </option>
        ))}
      </Selector>
      <Selector id="paquete_id" name="paquete_id" etiqueta="Paquete" defaultValue={valores.paquete_id ?? ""} key={`p-${servicioId}`} disabled={!paquetes.length && !valores.paquete_id}>
        <option value="">{paquetes.length ? "No usar paquete" : "Sin paquetes para este servicio"}</option>
        {opciones.paquetes
          .filter((p) => p.servicio_id === servicioId && (p.sesiones_usadas < p.sesiones_totales || p.id === valores.paquete_id))
          .map((p) => (
            <option key={p.id} value={p.id}>
              Paquete: quedan {p.sesiones_totales - p.sesiones_usadas} de {p.sesiones_totales}
              {p.vence_en ? ` (vence ${p.vence_en.split("-").reverse().join("/")})` : ""}
            </option>
          ))}
      </Selector>
      <div className="sm:col-span-2">
        <AreaTexto id="notas_internas" name="notas_internas" etiqueta="Notas internas (no las ve el paciente)" defaultValue={valores.notas_internas ?? ""} rows={2} />
      </div>
      <div className="sm:col-span-2">
        <Casilla id="fuera_horario" name="fuera_horario" etiqueta="Agendar fuera del horario de atención del profesional" />
      </div>
    </div>
  );
}
