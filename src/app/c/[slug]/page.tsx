import { Tarjeta } from "@/components/ui";
import { exigirClinica } from "@/lib/sesion";

export default async function Agenda({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug);
  const hoy = new Intl.DateTimeFormat("es-UY", { timeZone: "America/Montevideo", dateStyle: "full" }).format(new Date());

  return (
    <>
      <div>
        <p className="text-sm font-semibold text-tinta-suave first-letter:uppercase">{hoy}</p>
        <h1 className="font-display text-[34px] font-semibold">Agenda del día</h1>
      </div>
      <Tarjeta>
        <p className="text-tinta-media">
          Bienvenida/o al panel de {clinica.nombre}. La agenda, los pacientes y los turnos llegan en la fase 2.
        </p>
      </Tarjeta>
    </>
  );
}
