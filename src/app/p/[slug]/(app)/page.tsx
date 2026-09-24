import Link from "next/link";
import { Tarjeta } from "@/components/ui";
import { formatoFecha } from "@/lib/formato";
import { hoy } from "@/lib/fechas";
import { exigirPaciente } from "@/lib/sesion-paciente";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ContactoClinica } from "../encabezado";
import { ESTADOS_PROXIMOS, misTurnos } from "./datos";
import { InstalarApp } from "./instalar";
import { Turno } from "./turno";

export default async function InicioPaciente({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { marca, paciente } = await exigirPaciente(slug);
  if (!paciente) return null;
  const supabase = await crearClienteServidor();
  const ahora = new Date().toISOString();
  const [turnos, paquetes, avisos, servicios] = await Promise.all([
    misTurnos(marca.id),
    supabase.from("paquetes").select("id, servicio_id, sesiones_totales, sesiones_usadas, vence_en").eq("paciente_id", paciente.id),
    supabase.from("avisos").select("id, titulo, texto").eq("clinica_id", marca.id).order("visible_desde", { ascending: false }).limit(5),
    supabase.from("servicios").select("id, nombre").eq("clinica_id", marca.id),
  ]);
  const proximos = turnos.filter((t) => t.inicio >= ahora && ESTADOS_PROXIMOS.includes(t.estado));
  const [proximo, ...otros] = proximos;
  const nombreServicio = new Map((servicios.data ?? []).map((s) => [s.id, s.nombre]));
  const paquetesActivos = (paquetes.data ?? []).filter((p) => p.sesiones_usadas < p.sesiones_totales && (!p.vence_en || p.vence_en >= hoy()));

  return (
    <>
      <h1 className="font-display text-[28px] font-semibold">Hola, {paciente.nombre.split(" ")[0]}</h1>

      <section className="flex flex-col gap-3" aria-labelledby="t-proximo">
        <h2 id="t-proximo" className="text-lg font-bold">
          Tu próximo turno
        </h2>
        {proximo ? (
          <Turno slug={slug} t={proximo} destacado />
        ) : (
          <Tarjeta>
            <p className="text-tinta-media">No tenés turnos próximos. Para sacar un turno, comunicate con la clínica.</p>
          </Tarjeta>
        )}
        {otros.length > 0 && (
          <Link href={`/p/${slug}/turnos`} className="font-semibold text-marca underline">
            Ver {otros.length === 1 ? "otro turno próximo" : `otros ${otros.length} turnos próximos`}
          </Link>
        )}
      </section>

      {paquetesActivos.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-paquetes">
          <h2 id="t-paquetes" className="text-lg font-bold">
            Tus paquetes
          </h2>
          {paquetesActivos.map((p) => (
            <Tarjeta key={p.id} className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{nombreServicio.get(p.servicio_id) ?? "Paquete"}</span>
                <span className="text-sm text-tinta-suave">
                  {p.sesiones_usadas} de {p.sesiones_totales} sesiones
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-neutro-claro"
                role="progressbar"
                aria-valuenow={p.sesiones_usadas}
                aria-valuemin={0}
                aria-valuemax={p.sesiones_totales}
                aria-label="Sesiones realizadas"
              >
                <div className="h-full rounded-full bg-marca" style={{ width: `${(p.sesiones_usadas / p.sesiones_totales) * 100}%` }} />
              </div>
              <span className="text-sm text-tinta-suave">
                Te quedan {p.sesiones_totales - p.sesiones_usadas}
                {p.vence_en && ` · vence el ${formatoFecha(p.vence_en)}`}
              </span>
            </Tarjeta>
          ))}
        </section>
      )}

      {(avisos.data ?? []).length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="t-avisos">
          <h2 id="t-avisos" className="text-lg font-bold">
            Avisos de la clínica
          </h2>
          {(avisos.data ?? []).map((a) => (
            <Tarjeta key={a.id} className="flex flex-col gap-1 p-5">
              <span className="font-semibold">{a.titulo}</span>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-tinta-media">{a.texto}</p>
            </Tarjeta>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="t-contacto">
        <h2 id="t-contacto" className="text-lg font-bold">
          Contacto
        </h2>
        <Tarjeta className="flex flex-col gap-2 p-5">
          <span className="font-semibold">{marca.nombre}</span>
          <ContactoClinica marca={marca} />
          <p className="text-[13px] text-tinta-suave">Para sacar un turno nuevo, comunicate con la clínica.</p>
        </Tarjeta>
      </section>

      <InstalarApp nombre={marca.nombre} />
    </>
  );
}
