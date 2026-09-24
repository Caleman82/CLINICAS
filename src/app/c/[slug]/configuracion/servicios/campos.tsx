import { AreaTexto, Campo, Selector } from "@/components/ui";
import type { Servicio } from "@/lib/datos-clinica";

/** Campos compartidos por el alta y la edición de un servicio. */
export function CamposServicio({ s, tiposRecurso }: { s?: Servicio; tiposRecurso: string[] }) {
  return (
    <>
      <Campo id="nombre" name="nombre" etiqueta="Nombre" defaultValue={s?.nombre} required />
      <div className="grid grid-cols-2 gap-4">
        <Campo id="duracion_min" name="duracion_min" etiqueta="Duración (minutos)" type="number" min={5} max={720} step={5} defaultValue={s?.duracion_min ?? 30} required />
        <Campo id="precio" name="precio" etiqueta="Precio (UYU, opcional)" inputMode="decimal" defaultValue={s?.precio ?? ""} />
      </div>
      <Selector id="requiere_recurso_tipo" name="requiere_recurso_tipo" etiqueta="Requiere recurso" defaultValue={s?.requiere_recurso_tipo ?? ""}>
        <option value="">No requiere</option>
        {tiposRecurso.map((t) => (
          <option key={t} value={t}>
            Tipo: {t}
          </option>
        ))}
      </Selector>
      <AreaTexto
        id="indicaciones_previas"
        name="indicaciones_previas"
        etiqueta="Indicaciones previas para el paciente"
        defaultValue={s?.indicaciones_previas ?? ""}
        ayuda="Solo logística (ej.: venir 10 minutos antes, en ayunas). Se muestran al paciente en la app."
      />
    </>
  );
}
