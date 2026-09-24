import Link from "next/link";
import { Formulario } from "@/components/formulario";
import { EnlaceBoton, Mensaje, Tarjeta, Titulo, Vacio } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import { esFecha, hoy } from "@/lib/fechas";
import { exigirClinica, MENSAJE_SOLO_LECTURA, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearTurno } from "../acciones";
import { CamposTurno } from "../campos-turno";
import { opcionesTurno } from "../opciones";

type Busqueda = { paciente?: string; q?: string; prof?: string; fecha?: string; hora?: string };

export default async function NuevoTurno({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Busqueda> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { clinica } = await exigirClinica(slug, ROLES_GESTION);
  if (!puedeEscribir(clinica)) return <Mensaje tipo="alerta">{MENSAJE_SOLO_LECTURA}</Mensaje>;
  const supabase = await crearClienteServidor();

  const conservar = new URLSearchParams(Object.entries({ prof: sp.prof, fecha: sp.fecha, hora: sp.hora }).filter(([, v]) => v) as [string, string][]);
  const volver = (
    <Link href={`/c/${slug}${sp.fecha ? `?fecha=${sp.fecha}` : ""}`} className="text-sm font-semibold text-marca">
      ← Agenda
    </Link>
  );

  const paciente =
    sp.paciente && /^[0-9a-f-]{36}$/.test(sp.paciente)
      ? (await supabase.from("pacientes").select("id, nombre, apellido, cedula").eq("id", sp.paciente).eq("clinica_id", clinica.clinica_id).maybeSingle()).data
      : null;

  // Paso 1: elegir el paciente.
  if (!paciente) {
    const q = (sp.q ?? "").slice(0, 100);
    const { data } = q ? await supabase.rpc("buscar_pacientes", { p_clinica: clinica.clinica_id, p_texto: q, p_limite: 20 }) : { data: [] };
    const resultados = (data ?? []) as { id: string; nombre: string; apellido: string; cedula: string }[];
    return (
      <>
        {volver}
        <Titulo>Nuevo turno</Titulo>
        <Tarjeta className="flex max-w-2xl flex-col gap-4">
          <h2 className="text-lg font-bold">¿Para qué paciente?</h2>
          <form className="flex gap-2" role="search">
            {[...conservar.entries()].map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label htmlFor="q" className="sr-only">
              Buscar paciente
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              autoFocus
              placeholder="Nombre, cédula o celular"
              className="h-12 min-w-0 flex-1 rounded-[10px] border border-borde-campo bg-superficie px-3.5 text-base focus:border-marca focus:outline-2 focus:outline-marca/30"
            />
            <button className="h-12 rounded-[10px] bg-tinta px-5 font-semibold text-white hover:bg-tinta-media">Buscar</button>
          </form>
          {q && resultados.length === 0 && <Vacio>No encontramos pacientes para &ldquo;{q}&rdquo;.</Vacio>}
          <ul className="divide-y divide-borde">
            {resultados.map((p) => {
              const u = new URLSearchParams(conservar);
              u.set("paciente", p.id);
              return (
                <li key={p.id}>
                  <Link href={`/c/${slug}/turnos/nuevo?${u}`} className="flex justify-between gap-3 py-3 hover:opacity-80">
                    <span className="font-semibold">
                      {p.apellido}, {p.nombre}
                    </span>
                    <span className="text-sm text-tinta-suave">{formatoCedula(p.cedula)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-borde pt-4">
            <EnlaceBoton href={`/c/${slug}/pacientes/nuevo`} variante="secundario">
              Dar de alta un paciente nuevo
            </EnlaceBoton>
          </div>
        </Tarjeta>
      </>
    );
  }

  // Paso 2: datos del turno.
  const { opciones } = await opcionesTurno(clinica.clinica_id, paciente.id);
  const fecha = sp.fecha && esFecha(sp.fecha) ? sp.fecha : hoy();
  const hora = sp.hora && /^\d{2}:\d{2}$/.test(sp.hora) ? sp.hora : undefined;

  return (
    <>
      {volver}
      <Titulo detalle={`Para ${paciente.nombre} ${paciente.apellido} · CI ${formatoCedula(paciente.cedula)}`}>Nuevo turno</Titulo>
      {opciones.servicios.length === 0 || opciones.profesionales.length === 0 ? (
        <Mensaje tipo="alerta">
          Antes de agendar hay que cargar al menos un profesional y un servicio en Configuración.
        </Mensaje>
      ) : (
        <Tarjeta className="max-w-3xl">
          <Formulario accion={crearTurno.bind(null, slug)} textoBoton="Agendar turno" textoPendiente="Agendando…">
            <input type="hidden" name="paciente_id" value={paciente.id} />
            <CamposTurno opciones={opciones} valores={{ profesional_id: sp.prof, fecha, hora }} />
          </Formulario>
        </Tarjeta>
      )}
    </>
  );
}
