import Link from "next/link";
import { Formulario } from "@/components/formulario";
import { Campo, Insignia, Selector, Tarjeta, Vacio } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { nombreDia } from "@/lib/fechas";
import { exigirClinica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearProfesional } from "../acciones";

export default async function Profesionales({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const { profesionales, servicios, horarios } = await cargarConfiguracion(clinica.clinica_id);
  const supabase = await crearClienteServidor();
  const { data: equipo } = await supabase
    .from("membresias")
    .select("user_id, nombre, rol")
    .eq("clinica_id", clinica.clinica_id)
    .eq("activo", true)
    .order("nombre");
  const vinculados = new Set(profesionales.map((p) => p.user_id));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Tarjeta className="px-6 py-2">
        {profesionales.length === 0 ? (
          <Vacio>Todavía no hay profesionales. Creá el primero.</Vacio>
        ) : (
          <ul className="divide-y divide-borde">
            {profesionales.map((p) => {
              const dias = [...new Set(horarios.filter((h) => h.profesional_id === p.id).map((h) => h.dia_semana))];
              return (
                <li key={p.id}>
                  <Link href={`/c/${slug}/configuracion/profesionales/${p.id}`} className="flex items-center gap-4 py-4 hover:opacity-80">
                    <span className="size-4 shrink-0 rounded-full" style={{ background: p.color_agenda }} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{p.nombre_visible}</span>
                        {!p.activo && <Insignia>Inactivo</Insignia>}
                        {!p.user_id && <Insignia tono="alerta">Sin usuario</Insignia>}
                      </div>
                      <span className="text-sm text-tinta-suave">
                        {p.especialidad ?? "Sin especialidad"} · {p.servicios.length} de {servicios.length} servicios ·{" "}
                        {dias.length ? dias.sort().map((d) => nombreDia(d).slice(0, 3)).join(", ") : "sin horarios"}
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
        <h2 className="text-lg font-bold">Nuevo profesional</h2>
        <Formulario accion={crearProfesional.bind(null, slug)} textoBoton="Crear profesional">
          <Campo id="nombre_visible" name="nombre_visible" etiqueta="Nombre a mostrar" placeholder="Dra. Laura Gómez" required />
          <Campo id="especialidad" name="especialidad" etiqueta="Especialidad" />
          <Campo id="color_agenda" name="color_agenda" etiqueta="Color en la agenda" type="color" defaultValue="#1F6F6B" />
          <Selector id="user_id" name="user_id" etiqueta="Usuario del equipo (opcional)" defaultValue="">
            <option value="">Sin usuario (no ingresa al panel)</option>
            {(equipo ?? [])
              .filter((m) => !vinculados.has(m.user_id))
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nombre}
                </option>
              ))}
          </Selector>
          <p className="text-[13px] text-tinta-suave">
            Vinculá el usuario para que el profesional vea su agenda y sus pacientes al ingresar.
          </p>
        </Formulario>
      </Tarjeta>
    </div>
  );
}
