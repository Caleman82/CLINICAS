import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoTurnoInsignia } from "@/components/estado-turno";
import { BotonAccion, Formulario } from "@/components/formulario";
import { Tarjeta, Titulo } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import { fechaLarga, partesLocales } from "@/lib/fechas";
import { formatoFechaHora } from "@/lib/formato";
import { exigirClinica, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ESTADOS_PROFESIONAL, ETIQUETA_ACCION, TRANSICIONES, type EstadoTurno } from "@/lib/turnos";
import { cambiarEstadoTurno, moverTurno } from "../acciones";
import { CamposTurno } from "../campos-turno";
import { opcionesTurno } from "../opciones";

type Turno = {
  id: string;
  paciente_id: string;
  profesional_id: string;
  servicio_id: string;
  recurso_id: string | null;
  paquete_id: string | null;
  inicio: string;
  fin: string;
  estado: EstadoTurno;
  notas_internas: string | null;
  creado_en: string;
  pacientes: { nombre: string; apellido: string; cedula: string; celular: string | null } | null;
};

export default async function DetalleTurno({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { clinica } = await exigirClinica(slug);
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase
    .from("turnos")
    .select("*, pacientes(nombre, apellido, cedula, celular)")
    .eq("id", id)
    .eq("clinica_id", clinica.clinica_id)
    .maybeSingle<Turno>();
  if (!t) notFound();

  const { opciones, config } = await opcionesTurno(clinica.clinica_id, t.paciente_id, {
    profesional: t.profesional_id,
    servicio: t.servicio_id,
    recurso: t.recurso_id,
  });
  const servicio = config.servicios.find((s) => s.id === t.servicio_id);
  const prof = config.profesionales.find((p) => p.id === t.profesional_id);
  const recurso = config.recursos.find((r) => r.id === t.recurso_id);
  const ini = partesLocales(t.inicio);
  const fin = partesLocales(t.fin);
  const duracion = Math.round((new Date(t.fin).getTime() - new Date(t.inicio).getTime()) / 60000);
  const escribe = puedeEscribir(clinica);
  const gestion = ROLES_GESTION.includes(clinica.rol);
  const editable = gestion && escribe && ["agendado", "confirmado", "reprogramar_solicitado"].includes(t.estado);
  // Si el turno usa un paquete, se muestra aunque esté agotado.
  if (t.paquete_id && !opciones.paquetes.some((p) => p.id === t.paquete_id)) {
    const { data: pq } = await supabase.from("paquetes").select("id, servicio_id, sesiones_totales, sesiones_usadas, vence_en").eq("id", t.paquete_id).maybeSingle();
    if (pq) opciones.paquetes.push(pq);
  }
  const paquete = opciones.paquetes.find((p) => p.id === t.paquete_id);

  return (
    <>
      <Link href={`/c/${slug}?fecha=${ini.fecha}`} className="text-sm font-semibold text-marca">
        ← Agenda del {ini.fecha.split("-").reverse().join("/")}
      </Link>
      <Titulo detalle={`${fechaLarga(ini.fecha)} · ${ini.hora} a ${fin.hora}`} acciones={<EstadoTurnoInsignia estado={t.estado} />}>
        {servicio?.nombre}
      </Titulo>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Tarjeta className="grid gap-4 text-[15px] sm:grid-cols-2">
            <div>
              <div className="text-[13px] font-semibold text-tinta-suave">Paciente</div>
              <Link href={`/c/${slug}/pacientes/${t.paciente_id}`} className="font-semibold text-marca hover:underline">
                {t.pacientes?.nombre} {t.pacientes?.apellido}
              </Link>
              <div className="text-sm text-tinta-suave">
                CI {t.pacientes && formatoCedula(t.pacientes.cedula)} · {t.pacientes?.celular ?? "sin celular"}
              </div>
            </div>
            <Dato titulo="Profesional" valor={prof?.nombre_visible} />
            <Dato titulo="Recurso" valor={recurso?.nombre ?? "Sin recurso"} />
            <Dato titulo="Duración" valor={`${duracion} minutos`} />
            <Dato titulo="Paquete" valor={paquete ? `Sesiones ${paquete.sesiones_usadas} de ${paquete.sesiones_totales}` : "No"} />
            <Dato titulo="Agendado" valor={formatoFechaHora(t.creado_en)} />
            {servicio?.indicaciones_previas && (
              <div className="sm:col-span-2">
                <div className="text-[13px] font-semibold text-tinta-suave">Indicaciones previas</div>
                <p className="whitespace-pre-wrap">{servicio.indicaciones_previas}</p>
              </div>
            )}
            {t.notas_internas && (
              <div className="sm:col-span-2">
                <div className="text-[13px] font-semibold text-tinta-suave">Notas internas</div>
                <p className="whitespace-pre-wrap">{t.notas_internas}</p>
              </div>
            )}
          </Tarjeta>

          {escribe && (
            <Tarjeta className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">Estado</h2>
              <div className="flex flex-wrap gap-3">
                {TRANSICIONES[t.estado].filter((e) => gestion || ESTADOS_PROFESIONAL.includes(e)).map((e) => (
                  <BotonAccion
                    key={e}
                    accion={cambiarEstadoTurno.bind(null, slug, id, e)}
                    texto={ETIQUETA_ACCION[e]}
                    variante={e === "cancelado" || e === "no_asistio" ? "peligro" : e === "atendido" || e === "confirmado" ? "primario" : "secundario"}
                    confirmar={e === "cancelado" ? "¿Cancelar el turno? El horario queda libre." : undefined}
                  />
                ))}
              </div>
              {t.paquete_id && t.estado !== "atendido" && (
                <p className="text-[13px] text-tinta-suave">Al marcarlo como atendido se descuenta una sesión del paquete.</p>
              )}
            </Tarjeta>
          )}
        </div>

        {editable && (
          <Tarjeta className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Mover o modificar</h2>
            <Formulario accion={moverTurno.bind(null, slug, id)} textoBoton="Guardar cambios">
              <CamposTurno
                opciones={opciones}
                valores={{
                  profesional_id: t.profesional_id,
                  servicio_id: t.servicio_id,
                  fecha: ini.fecha,
                  hora: ini.hora,
                  duracion_min: duracion,
                  recurso_id: t.recurso_id,
                  paquete_id: t.paquete_id,
                  notas_internas: t.notas_internas,
                }}
              />
            </Formulario>
          </Tarjeta>
        )}
      </div>
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-tinta-suave">{titulo}</div>
      <div className="font-medium">{valor || "—"}</div>
    </div>
  );
}
