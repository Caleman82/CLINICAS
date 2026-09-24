import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonAccion, Formulario } from "@/components/formulario";
import { Campo, Casilla, Mensaje, Selector, Tarjeta, Vacio } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { nombreDia } from "@/lib/fechas";
import { exigirClinica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agregarHorario, borrarHorario, editarProfesional, guardarServiciosDeProfesional } from "../../acciones";

export default async function EditarProfesional({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { slug, id } = await params;
  const { nuevo } = await searchParams;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const { profesionales, servicios, horarios } = await cargarConfiguracion(clinica.clinica_id);
  const p = profesionales.find((x) => x.id === id);
  if (!p) notFound();
  const supabase = await crearClienteServidor();
  const { data: equipo } = await supabase.from("membresias").select("user_id, nombre").eq("clinica_id", clinica.clinica_id).eq("activo", true).order("nombre");
  const vinculadosAOtros = new Set(profesionales.filter((x) => x.id !== id).map((x) => x.user_id));
  const susHorarios = horarios.filter((h) => h.profesional_id === id);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/c/${slug}/configuracion/profesionales`} className="text-sm font-semibold text-marca">
        ← Profesionales
      </Link>
      {nuevo && <Mensaje tipo="exito">Profesional creado. Ahora indicá qué servicios realiza y sus horarios.</Mensaje>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Datos</h2>
          <Formulario accion={editarProfesional.bind(null, slug, id)} textoBoton="Guardar cambios">
            <Campo id="nombre_visible" name="nombre_visible" etiqueta="Nombre a mostrar" defaultValue={p.nombre_visible} required />
            <Campo id="especialidad" name="especialidad" etiqueta="Especialidad" defaultValue={p.especialidad ?? ""} />
            <Campo id="color_agenda" name="color_agenda" etiqueta="Color en la agenda" type="color" defaultValue={p.color_agenda} />
            <Selector id="user_id" name="user_id" etiqueta="Usuario del equipo" defaultValue={p.user_id ?? ""}>
              <option value="">Sin usuario</option>
              {(equipo ?? [])
                .filter((m) => !vinculadosAOtros.has(m.user_id))
                .map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nombre}
                  </option>
                ))}
            </Selector>
            <Casilla id="activo" name="activo" etiqueta="Activo (aparece en la agenda y se le pueden dar turnos)" defaultChecked={p.activo} />
          </Formulario>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Servicios que realiza</h2>
          {servicios.length === 0 ? (
            <Vacio>
              Primero creá los servicios en <Link href={`/c/${slug}/configuracion/servicios`} className="text-marca underline">Servicios</Link>.
            </Vacio>
          ) : (
            <Formulario accion={guardarServiciosDeProfesional.bind(null, slug, id)} textoBoton="Guardar servicios" className="flex flex-col gap-3">
              {servicios.map((s) => (
                <Casilla
                  key={s.id}
                  id={`s-${s.id}`}
                  name="servicio"
                  value={s.id}
                  defaultChecked={p.servicios.includes(s.id)}
                  etiqueta={
                    <>
                      {s.nombre} <span className="text-tinta-suave">· {s.duracion_min} min{!s.activo && " · inactivo"}</span>
                    </>
                  }
                />
              ))}
              <p className="text-[13px] text-tinta-suave">
                Si un servicio no tiene ningún profesional marcado, cualquiera puede realizarlo.
              </p>
            </Formulario>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="flex flex-col gap-5">
        <h2 className="text-lg font-bold">Horarios de atención</h2>
        {susHorarios.length === 0 ? (
          <Vacio>Sin horarios cargados. Mientras tanto, la agenda no controla el horario de este profesional.</Vacio>
        ) : (
          <ul className="divide-y divide-borde">
            {susHorarios.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-4 py-2.5">
                <span>
                  <span className="inline-block w-24 font-semibold first-letter:uppercase">{nombreDia(h.dia_semana)}</span>
                  {h.hora_inicio} a {h.hora_fin}
                </span>
                <BotonAccion accion={borrarHorario.bind(null, slug, h.id)} texto="Quitar" variante="peligro" />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-borde pt-5">
          <Formulario accion={agregarHorario.bind(null, slug, id)} textoBoton="Agregar horario" variante="secundario" limpiar>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-semibold">Días</legend>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <Casilla key={d} id={`dia-${d}`} name="dia" value={String(d)} etiqueta={nombreDia(d)} />
              ))}
            </fieldset>
            <div className="grid max-w-md grid-cols-2 gap-4">
              <Campo id="hora_inicio" name="hora_inicio" etiqueta="Desde" type="time" step={900} required />
              <Campo id="hora_fin" name="hora_fin" etiqueta="Hasta" type="time" step={900} required />
            </div>
          </Formulario>
        </div>
      </Tarjeta>
    </div>
  );
}
