import Link from "next/link";
import { Formulario } from "@/components/formulario";
import { Casilla, Mensaje, Tarjeta, Titulo } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { exigirClinica, MENSAJE_SOLO_LECTURA, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearPaciente } from "../acciones";
import { CamposPaciente } from "../campos";

export default async function NuevoPaciente({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ROLES_GESTION);
  if (!puedeEscribir(clinica)) return <Mensaje tipo="alerta">{MENSAJE_SOLO_LECTURA}</Mensaje>;
  const { profesionales } = await cargarConfiguracion(clinica.clinica_id);

  return (
    <>
      <Link href={`/c/${slug}/pacientes`} className="text-sm font-semibold text-marca">
        ← Pacientes
      </Link>
      <Titulo>Nuevo paciente</Titulo>
      <Tarjeta className="max-w-3xl">
        <Formulario accion={crearPaciente.bind(null, slug)} textoBoton="Dar de alta" textoPendiente="Guardando…">
          <CamposPaciente profesionales={profesionales} />
          <div className="rounded-xl border border-borde bg-fondo p-4">
            <Casilla
              id="consentimiento"
              name="consentimiento"
              required
              etiqueta={
                <>
                  <strong>Consentimiento registrado.</strong> El paciente autorizó a {clinica.nombre} a registrar y tratar
                  sus datos personales y de salud para su atención (Ley 18.331). Se guarda la fecha y hora de este registro.
                </>
              }
            />
          </div>
        </Formulario>
      </Tarjeta>
    </>
  );
}
