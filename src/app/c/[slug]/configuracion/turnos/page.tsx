import { Formulario } from "@/components/formulario";
import { Tarjeta } from "@/components/ui";
import { exigirClinica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { OPCIONES_LIMITE_CANCELACION } from "@/lib/turnos";
import { guardarLimiteCancelacion } from "../acciones";

export default async function PoliticaTurnos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("clinicas").select("horas_limite_cancelacion").eq("id", clinica.clinica_id).single();
  const actual = data?.horas_limite_cancelacion ?? 48;

  return (
    <Tarjeta className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">Cancelación de turnos desde la app</h2>
        <p className="text-[15px] leading-relaxed text-tinta-media">
          Los pacientes pueden cancelar sus turnos desde la app hasta el plazo que elijas. Pasado ese plazo, el botón
          les aparece bloqueado con el aviso de que están fuera de las horas posibles y que se comuniquen con la clínica.
        </p>
      </div>
      <Formulario accion={guardarLimiteCancelacion.bind(null, slug)} textoBoton="Guardar">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">Se puede cancelar hasta</legend>
          {OPCIONES_LIMITE_CANCELACION.map((h) => (
            <label key={h} className="flex items-center gap-3 text-[15px]">
              <input type="radio" name="horas_limite_cancelacion" value={h} defaultChecked={h === actual} className="size-5 accent-marca" />
              {h} horas antes del turno
            </label>
          ))}
          {!OPCIONES_LIMITE_CANCELACION.includes(actual) && (
            <p className="text-[13px] text-tinta-suave">Valor actual: {actual} horas.</p>
          )}
        </fieldset>
      </Formulario>
      <p className="text-[13px] text-tinta-suave">
        El plazo se controla en el servidor: aunque alguien lo intente por fuera de la app, no puede cancelar fuera de plazo.
        Recepción puede cancelar turnos en cualquier momento desde la agenda.
      </p>
    </Tarjeta>
  );
}
