import Link from "next/link";
import { Formulario } from "@/components/formulario";
import { Insignia, Tarjeta, Vacio } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { formatoPesos } from "@/lib/formato";
import { exigirClinica } from "@/lib/sesion";
import { crearServicio } from "../acciones";
import { CamposServicio } from "./campos";

export default async function Servicios({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const { servicios, recursos, profesionales } = await cargarConfiguracion(clinica.clinica_id);
  const tipos = [...new Set(recursos.map((r) => r.tipo))];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <Tarjeta className="px-6 py-2">
        {servicios.length === 0 ? (
          <Vacio>Todavía no hay servicios.</Vacio>
        ) : (
          <ul className="divide-y divide-borde">
            {servicios.map((s) => {
              const quienes = profesionales.filter((p) => p.servicios.includes(s.id));
              return (
                <li key={s.id}>
                  <Link href={`/c/${slug}/configuracion/servicios/${s.id}`} className="flex items-center gap-4 py-4 hover:opacity-80">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{s.nombre}</span>
                        {!s.activo && <Insignia>Inactivo</Insignia>}
                        {s.requiere_recurso_tipo && <Insignia tono="marca">Requiere {s.requiere_recurso_tipo}</Insignia>}
                      </div>
                      <span className="text-sm text-tinta-suave">
                        {s.duracion_min} min · {formatoPesos(s.precio)} ·{" "}
                        {quienes.length ? quienes.map((p) => p.nombre_visible).join(", ") : "cualquier profesional"}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-marca">Editar</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
      <Tarjeta className="flex flex-col gap-4 self-start">
        <h2 className="text-lg font-bold">Nuevo servicio</h2>
        <Formulario accion={crearServicio.bind(null, slug)} textoBoton="Crear servicio" limpiar>
          <CamposServicio tiposRecurso={tipos} />
        </Formulario>
      </Tarjeta>
    </div>
  );
}
