import Link from "next/link";
import { notFound } from "next/navigation";
import { Formulario } from "@/components/formulario";
import { Mensaje, Tarjeta, Titulo } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { exigirClinica, MENSAJE_SOLO_LECTURA, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { editarPaciente } from "../../acciones";
import { CamposPaciente, type DatosPaciente } from "../../campos";

export default async function EditarPaciente({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { clinica } = await exigirClinica(slug, ROLES_GESTION);
  if (!puedeEscribir(clinica)) return <Mensaje tipo="alerta">{MENSAJE_SOLO_LECTURA}</Mensaje>;
  const supabase = await crearClienteServidor();
  const [{ data: p }, { profesionales }] = await Promise.all([
    supabase
      .from("pacientes")
      .select("nombre, apellido, cedula, fecha_nacimiento, celular, email, profesional_referencia_id")
      .eq("id", id)
      .eq("clinica_id", clinica.clinica_id)
      .maybeSingle(),
    cargarConfiguracion(clinica.clinica_id),
  ]);
  if (!p) notFound();

  return (
    <>
      <Link href={`/c/${slug}/pacientes/${id}`} className="text-sm font-semibold text-marca">
        ← Volver a la ficha
      </Link>
      <Titulo>
        Editar: {p.nombre} {p.apellido}
      </Titulo>
      <Tarjeta className="max-w-3xl">
        <Formulario accion={editarPaciente.bind(null, slug, id)} textoBoton="Guardar cambios">
          <CamposPaciente p={p as DatosPaciente} profesionales={profesionales} />
        </Formulario>
      </Tarjeta>
    </>
  );
}
