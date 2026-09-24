import Link from "next/link";
import { BotonAccion, Formulario } from "@/components/formulario";
import { Campo, Selector, Tarjeta, Titulo, Vacio } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { hoy } from "@/lib/fechas";
import { formatoFechaHora } from "@/lib/formato";
import { exigirClinica, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { borrarBloqueo, crearBloqueo } from "./acciones";

export default async function Bloqueos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ROLES_GESTION);
  const escribe = puedeEscribir(clinica);
  const config = await cargarConfiguracion(clinica.clinica_id);
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("bloqueos_agenda")
    .select("id, profesional_id, recurso_id, desde, hasta, motivo")
    .eq("clinica_id", clinica.clinica_id)
    .gt("hasta", new Date().toISOString())
    .order("desde");
  const nombre = new Map([
    ...config.profesionales.map((p) => [p.id, p.nombre_visible] as const),
    ...config.recursos.map((r) => [r.id, r.nombre] as const),
  ]);
  const f = hoy();

  return (
    <>
      <Link href={`/c/${slug}`} className="text-sm font-semibold text-marca">
        ← Agenda
      </Link>
      <Titulo>Bloqueos de agenda</Titulo>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Tarjeta className="px-6 py-2">
          {(data ?? []).length === 0 ? (
            <Vacio>No hay bloqueos vigentes ni futuros.</Vacio>
          ) : (
            <ul className="divide-y divide-borde">
              {(data ?? []).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-semibold">{nombre.get(b.profesional_id ?? b.recurso_id ?? "") ?? "—"}</div>
                    <div className="text-sm text-tinta-suave">
                      {formatoFechaHora(b.desde)} a {formatoFechaHora(b.hasta)}
                      {b.motivo && ` · ${b.motivo}`}
                    </div>
                  </div>
                  {escribe && <BotonAccion accion={borrarBloqueo.bind(null, slug, b.id)} texto="Quitar" variante="peligro" confirmar="¿Quitar el bloqueo?" />}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        {escribe && (
          <Tarjeta className="flex flex-col gap-4 self-start">
            <h2 className="text-lg font-bold">Nuevo bloqueo</h2>
            <p className="text-sm text-tinta-suave">Licencias, feriados o mantenimiento. En ese período no se pueden agendar turnos.</p>
            <Formulario accion={crearBloqueo.bind(null, slug)} textoBoton="Bloquear">
              <Selector id="objetivo" name="objetivo" etiqueta="Qué se bloquea" required defaultValue="">
                <option value="" disabled>
                  Elegí
                </option>
                <optgroup label="Profesionales">
                  {config.profesionales.filter((p) => p.activo).map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.nombre_visible}
                    </option>
                  ))}
                </optgroup>
                {config.recursos.some((r) => r.activo) && (
                  <optgroup label="Recursos">
                    {config.recursos.filter((r) => r.activo).map((r) => (
                      <option key={r.id} value={`r:${r.id}`}>
                        {r.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Selector>
              <div className="grid grid-cols-2 gap-3">
                <Campo id="desde_fecha" name="desde_fecha" etiqueta="Desde" type="date" defaultValue={f} required />
                <Campo id="desde_hora" name="desde_hora" etiqueta="Hora" type="time" defaultValue="00:00" required />
                <Campo id="hasta_fecha" name="hasta_fecha" etiqueta="Hasta" type="date" defaultValue={f} required />
                <Campo id="hasta_hora" name="hasta_hora" etiqueta="Hora" type="time" defaultValue="23:59" required />
              </div>
              <Campo id="motivo" name="motivo" etiqueta="Motivo (interno)" placeholder="Licencia" />
            </Formulario>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
