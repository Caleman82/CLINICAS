import type { Metadata } from "next";
import { Tarjeta } from "@/components/ui";
import { exigirPaciente } from "@/lib/sesion-paciente";
import { ESTADOS_PROXIMOS, misTurnos } from "../datos";
import { Turno } from "../turno";

export const metadata: Metadata = { title: "Mis turnos" };

export default async function MisTurnos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { marca } = await exigirPaciente(slug);
  const turnos = await misTurnos(marca.id);
  const ahora = new Date().toISOString();
  const proximos = turnos.filter((t) => t.inicio >= ahora && ESTADOS_PROXIMOS.includes(t.estado));
  const anteriores = turnos.filter((t) => !proximos.includes(t)).reverse();

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Mis turnos</h1>
      <section className="flex flex-col gap-3" aria-labelledby="t-prox">
        <h2 id="t-prox" className="text-lg font-bold">
          Próximos
        </h2>
        {proximos.length === 0 ? (
          <Tarjeta>
            <p className="text-tinta-media">No tenés turnos próximos.</p>
          </Tarjeta>
        ) : (
          proximos.map((t) => <Turno key={t.id} slug={slug} t={t} />)
        )}
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="t-ant">
        <h2 id="t-ant" className="text-lg font-bold">
          Anteriores y cancelados
        </h2>
        {anteriores.length === 0 ? (
          <Tarjeta>
            <p className="text-tinta-media">Todavía no hay turnos anteriores.</p>
          </Tarjeta>
        ) : (
          anteriores.map((t) => <Turno key={t.id} slug={slug} t={t} acciones={false} />)
        )}
      </section>
    </>
  );
}
