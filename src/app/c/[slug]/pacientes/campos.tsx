import { Campo, Selector } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import type { Profesional } from "@/lib/datos-clinica";

export type DatosPaciente = {
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string | null;
  celular: string | null;
  email: string | null;
  profesional_referencia_id: string | null;
};

export function CamposPaciente({ p, profesionales }: { p?: DatosPaciente; profesionales: Profesional[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Campo id="nombre" name="nombre" etiqueta="Nombre" defaultValue={p?.nombre} autoComplete="off" required />
      <Campo id="apellido" name="apellido" etiqueta="Apellido" defaultValue={p?.apellido} autoComplete="off" required />
      <Campo
        id="cedula"
        name="cedula"
        etiqueta="Cédula"
        defaultValue={p ? formatoCedula(p.cedula) : undefined}
        inputMode="numeric"
        autoComplete="off"
        required
        ayuda="Con o sin puntos y guión. Va a ser su usuario en la app."
      />
      <Campo id="fecha_nacimiento" name="fecha_nacimiento" etiqueta="Fecha de nacimiento" type="date" defaultValue={p?.fecha_nacimiento ?? ""} />
      <Campo id="celular" name="celular" etiqueta="Celular" type="tel" defaultValue={p?.celular ?? ""} placeholder="099 123 456" />
      <Campo id="email" name="email" etiqueta="Email" type="email" defaultValue={p?.email ?? ""} />
      <div className="sm:col-span-2">
        <Selector id="profesional_referencia_id" name="profesional_referencia_id" etiqueta="Profesional de referencia" defaultValue={p?.profesional_referencia_id ?? ""}>
          <option value="">Sin asignar</option>
          {profesionales
            .filter((x) => x.activo || x.id === p?.profesional_referencia_id)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre_visible}
              </option>
            ))}
        </Selector>
      </div>
    </div>
  );
}
