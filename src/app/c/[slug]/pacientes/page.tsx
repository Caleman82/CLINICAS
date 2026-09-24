import Link from "next/link";
import { EnlaceBoton, Insignia, Tarjeta, Titulo, Vacio } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import { exigirClinica, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

type Fila = { id: string; nombre: string; apellido: string; cedula: string; celular: string | null; estado_acceso: string };

export default async function Pacientes({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const { q = "" } = await searchParams;
  const { clinica } = await exigirClinica(slug);
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("buscar_pacientes", { p_clinica: clinica.clinica_id, p_texto: q.slice(0, 100), p_limite: 50 });
  const pacientes = (data ?? []) as Fila[];
  const gestion = ROLES_GESTION.includes(clinica.rol);

  return (
    <>
      <Titulo
        acciones={gestion && puedeEscribir(clinica) && <EnlaceBoton href={`/c/${slug}/pacientes/nuevo`}>Nuevo paciente</EnlaceBoton>}
      >
        Pacientes
      </Titulo>
      <form className="flex max-w-xl gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Buscar paciente
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Nombre, cédula o celular"
          className="h-12 min-w-0 flex-1 rounded-[10px] border border-borde-campo bg-superficie px-3.5 text-base focus:border-marca focus:outline-2 focus:outline-marca/30"
        />
        <button className="h-12 rounded-[10px] bg-tinta px-5 font-semibold text-white hover:bg-tinta-media">Buscar</button>
      </form>
      <Tarjeta className="px-6 py-2">
        {pacientes.length === 0 ? (
          <Vacio>{q ? `No encontramos pacientes para "${q}".` : "Todavía no hay pacientes."}</Vacio>
        ) : (
          <ul className="divide-y divide-borde">
            {pacientes.map((p) => (
              <li key={p.id}>
                <Link href={`/c/${slug}/pacientes/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5 hover:opacity-80">
                  <span className="min-w-48 flex-1 font-bold">
                    {p.apellido}, {p.nombre}
                  </span>
                  <span className="w-32 text-sm text-tinta-suave">{formatoCedula(p.cedula)}</span>
                  <span className="w-32 text-sm text-tinta-suave">{p.celular ?? "—"}</span>
                  <span className="w-28">
                    {p.estado_acceso === "activo" && <Insignia tono="marca">App activa</Insignia>}
                    {p.estado_acceso === "desactivado" && <Insignia>Desactivado</Insignia>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {pacientes.length === 50 && <p className="text-sm text-tinta-suave">Se muestran los primeros 50. Refiná la búsqueda.</p>}
    </>
  );
}
