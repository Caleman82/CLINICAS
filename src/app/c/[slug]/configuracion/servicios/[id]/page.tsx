import Link from "next/link";
import { notFound } from "next/navigation";
import { Formulario } from "@/components/formulario";
import { Casilla, Tarjeta } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { exigirClinica } from "@/lib/sesion";
import { editarServicio } from "../../acciones";
import { CamposServicio } from "../campos";

export default async function EditarServicio({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const { servicios, recursos } = await cargarConfiguracion(clinica.clinica_id);
  const s = servicios.find((x) => x.id === id);
  if (!s) notFound();
  const tipos = [...new Set([...recursos.map((r) => r.tipo), ...(s.requiere_recurso_tipo ? [s.requiere_recurso_tipo] : [])])];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={`/c/${slug}/configuracion/servicios`} className="text-sm font-semibold text-marca">
        ← Servicios
      </Link>
      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">{s.nombre}</h2>
        <Formulario accion={editarServicio.bind(null, slug, id)} textoBoton="Guardar cambios">
          <CamposServicio s={s} tiposRecurso={tipos} />
          <Casilla id="activo" name="activo" etiqueta="Activo (se puede elegir al dar turnos)" defaultChecked={s.activo} />
        </Formulario>
        <p className="text-[13px] text-tinta-suave">Qué profesionales lo realizan se indica en la ficha de cada profesional.</p>
      </Tarjeta>
    </div>
  );
}
