import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoTurnoInsignia } from "@/components/estado-turno";
import { BotonAccion, Formulario } from "@/components/formulario";
import { AreaTexto, Campo, EnlaceBoton, Insignia, Mensaje, Selector, Tarjeta, Titulo, Vacio } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import { cargarConfiguracion, misProfesionales } from "@/lib/datos-clinica";
import { formatoFecha, formatoFechaHora } from "@/lib/formato";
import { hoy, partesLocales } from "@/lib/fechas";
import { exigirClinica, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoTurno } from "@/lib/turnos";
import { agregarNota, cambiarAccesoPaciente, crearPaquete, guardarCampos } from "../acciones";

type Paciente = {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string | null;
  celular: string | null;
  email: string | null;
  profesional_referencia_id: string | null;
  consentimiento_fecha: string;
  estado_acceso: "invitado" | "activo" | "desactivado";
  user_id: string | null;
  creado_en: string;
};

function edad(nacimiento: string): number {
  const [a, m, d] = nacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoy().split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

export default async function FichaPaciente({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { slug, id } = await params;
  const { nuevo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { ctx, clinica } = await exigirClinica(slug);
  const supabase = await crearClienteServidor();

  const { data: p } = await supabase.from("pacientes").select("*").eq("id", id).eq("clinica_id", clinica.clinica_id).maybeSingle<Paciente>();
  if (!p) notFound();

  // Auditoría: quién abrió la ficha.
  await supabase.rpc("registrar_acceso", { p_clinica: clinica.clinica_id, p_accion: "ver", p_entidad: "pacientes", p_entidad_id: id });

  const gestion = ROLES_GESTION.includes(clinica.rol);
  const escribe = puedeEscribir(clinica);
  const veClinico = clinica.rol === "admin_clinica" || clinica.rol === "profesional";

  const [config, turnos, paquetes, mensajes, notas, campos, valores, misProf] = await Promise.all([
    cargarConfiguracion(clinica.clinica_id),
    supabase
      .from("turnos")
      .select("id, inicio, estado, servicios(nombre), profesionales(nombre_visible)")
      .eq("paciente_id", id)
      .order("inicio", { ascending: false })
      .limit(100),
    supabase.from("paquetes").select("id, servicio_id, sesiones_totales, sesiones_usadas, vence_en").eq("paciente_id", id).order("vence_en", { ascending: false, nullsFirst: true }),
    gestion
      ? supabase.from("mensajes").select("id, canal, estado, creado_en, enviado_en, respuesta").eq("paciente_id", id).order("creado_en", { ascending: false }).limit(30)
      : Promise.resolve({ data: [] }),
    veClinico
      ? supabase.from("notas_clinicas").select("id, texto, creada_en, profesionales(nombre_visible)").eq("paciente_id", id).order("creada_en", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("campos_personalizados").select("id, nombre, tipo, opciones, visible_para").eq("clinica_id", clinica.clinica_id).order("orden"),
    supabase.from("valores_campos").select("campo_id, valor").eq("paciente_id", id),
    misProfesionales(clinica.clinica_id, ctx.userId),
  ]);

  const nombreServicio = new Map(config.servicios.map((s) => [s.id, s.nombre]));
  const referencia = config.profesionales.find((x) => x.id === p.profesional_referencia_id);
  const ahora = new Date().toISOString();
  const listaTurnos = (turnos.data ?? []) as unknown as {
    id: string;
    inicio: string;
    estado: EstadoTurno;
    servicios: { nombre: string } | null;
    profesionales: { nombre_visible: string } | null;
  }[];
  const proximos = listaTurnos.filter((t) => t.inicio >= ahora).reverse();
  const anteriores = listaTurnos.filter((t) => t.inicio < ahora);
  const valorDe = new Map((valores.data ?? []).map((v) => [v.campo_id, v.valor as string | null]));
  // Recepción no ve los campos reservados a profesionales (la base tampoco se los devuelve).
  const camposVisibles = (campos.data ?? []).filter((c) => c.visible_para === "todos" || veClinico);

  return (
    <>
      <Link href={`/c/${slug}/pacientes`} className="text-sm font-semibold text-marca">
        ← Pacientes
      </Link>
      {nuevo && <Mensaje tipo="exito">Paciente dado de alta. Ya podés agendarle turnos.</Mensaje>}
      <Titulo
        detalle={`CI ${formatoCedula(p.cedula)}${p.fecha_nacimiento ? ` · ${edad(p.fecha_nacimiento)} años` : ""}`}
        acciones={
          <>
            {gestion && escribe && (
              <EnlaceBoton href={`/c/${slug}/pacientes/${id}/editar`} variante="secundario">
                Editar datos
              </EnlaceBoton>
            )}
            {gestion && escribe && <EnlaceBoton href={`/c/${slug}/turnos/nuevo?paciente=${id}`}>Agendar turno</EnlaceBoton>}
          </>
        }
      >
        {p.nombre} {p.apellido}
      </Titulo>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Tarjeta className="grid gap-4 text-[15px] sm:grid-cols-2">
            <Dato titulo="Celular" valor={p.celular} />
            <Dato titulo="Email" valor={p.email} />
            <Dato titulo="Fecha de nacimiento" valor={formatoFecha(p.fecha_nacimiento)} />
            <Dato titulo="Profesional de referencia" valor={referencia?.nombre_visible} />
            <Dato titulo="Consentimiento registrado" valor={formatoFechaHora(p.consentimiento_fecha)} />
            <Dato titulo="Alta" valor={formatoFechaHora(p.creado_en)} />
          </Tarjeta>

          <Tarjeta className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Acceso a la app</h2>
            {p.estado_acceso === "invitado" && (
              <p className="text-[15px] text-tinta-media">
                Todavía no activó su cuenta. El envío de la invitación por WhatsApp o email llega en la fase 3.
              </p>
            )}
            {p.estado_acceso === "activo" && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Insignia tono="marca">Activo</Insignia>
                {gestion && (
                  <BotonAccion
                    accion={cambiarAccesoPaciente.bind(null, slug, id, "desactivado")}
                    texto="Desactivar acceso"
                    variante="peligro"
                    confirmar="¿Desactivar el acceso del paciente a la app? Se cierran sus sesiones."
                    deshabilitado={!escribe}
                  />
                )}
              </div>
            )}
            {p.estado_acceso === "desactivado" && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Insignia>Desactivado</Insignia>
                {gestion && p.user_id && (
                  <BotonAccion accion={cambiarAccesoPaciente.bind(null, slug, id, "activo")} texto="Reactivar acceso" deshabilitado={!escribe} />
                )}
              </div>
            )}
          </Tarjeta>

          <Tarjeta className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Paquetes</h2>
            {(paquetes.data ?? []).length === 0 && <Vacio>Sin paquetes.</Vacio>}
            <ul className="flex flex-col gap-4">
              {(paquetes.data ?? []).map((pq) => {
                const vencido = pq.vence_en && pq.vence_en < hoy();
                const pct = Math.round((pq.sesiones_usadas / pq.sesiones_totales) * 100);
                return (
                  <li key={pq.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{nombreServicio.get(pq.servicio_id) ?? "Servicio"}</span>
                      <span className="text-sm text-tinta-suave">
                        {pq.sesiones_usadas} de {pq.sesiones_totales} sesiones
                        {pq.vence_en && ` · ${vencido ? "venció" : "vence"} el ${formatoFecha(pq.vence_en)}`}
                      </span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-neutro-claro"
                      role="progressbar"
                      aria-valuenow={pq.sesiones_usadas}
                      aria-valuemin={0}
                      aria-valuemax={pq.sesiones_totales}
                      aria-label="Sesiones usadas"
                    >
                      <div className="h-full rounded-full bg-marca" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {gestion && escribe && config.servicios.some((s) => s.activo) && (
              <details className="border-t border-borde pt-4">
                <summary className="cursor-pointer text-[15px] font-semibold text-marca">Nuevo paquete</summary>
                <div className="pt-4">
                  <Formulario accion={crearPaquete.bind(null, slug, id)} textoBoton="Crear paquete" variante="secundario" limpiar>
                    <Selector id="servicio_id" name="servicio_id" etiqueta="Servicio" required defaultValue="">
                      <option value="" disabled>
                        Elegí un servicio
                      </option>
                      {config.servicios
                        .filter((s) => s.activo)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                    </Selector>
                    <div className="grid grid-cols-2 gap-4">
                      <Campo id="sesiones_totales" name="sesiones_totales" etiqueta="Sesiones" type="number" min={1} max={200} defaultValue={5} required />
                      <Campo id="vence_en" name="vence_en" etiqueta="Vence (opcional)" type="date" />
                    </div>
                  </Formulario>
                </div>
              </details>
            )}
          </Tarjeta>

          {camposVisibles.length > 0 && (
            <Tarjeta className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">Datos adicionales</h2>
              <Formulario accion={guardarCampos.bind(null, slug, id)} textoBoton="Guardar" variante="secundario" deshabilitado={!escribe}>
                {camposVisibles.map((c) =>
                  c.tipo === "opcion" || c.tipo === "si_no" ? (
                    <Selector key={c.id} id={`campo-${c.id}`} name={`campo:${c.id}`} etiqueta={c.nombre} defaultValue={valorDe.get(c.id) ?? ""}>
                      <option value="">—</option>
                      {(c.tipo === "si_no" ? ["Sí", "No"] : ((c.opciones as string[] | null) ?? [])).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Selector>
                  ) : (
                    <Campo
                      key={c.id}
                      id={`campo-${c.id}`}
                      name={`campo:${c.id}`}
                      etiqueta={c.nombre}
                      type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
                      defaultValue={valorDe.get(c.id) ?? ""}
                    />
                  ),
                )}
              </Formulario>
            </Tarjeta>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Tarjeta className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Próximos turnos</h2>
            <ListaTurnos slug={slug} turnos={proximos} vacio="Sin turnos próximos." />
            <h2 className="pt-3 text-lg font-bold">Historial de turnos</h2>
            <ListaTurnos slug={slug} turnos={anteriores} vacio="Sin turnos anteriores." />
          </Tarjeta>

          {gestion && (
            <Tarjeta className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">Mensajes</h2>
              {(mensajes.data ?? []).length === 0 ? (
                <Vacio>Todavía no se le enviaron mensajes. Los recordatorios llegan en la fase 4.</Vacio>
              ) : (
                <ul className="divide-y divide-borde text-[15px]">
                  {(mensajes.data ?? []).map((m) => (
                    <li key={m.id} className="flex justify-between gap-3 py-2">
                      <span>
                        {m.canal === "whatsapp" ? "WhatsApp" : "Email"} · {m.estado}
                      </span>
                      <span className="text-tinta-suave">{formatoFechaHora(m.enviado_en ?? m.creado_en)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {veClinico && (
            <Tarjeta className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold">Notas clínicas</h2>
                <p className="text-[13px] text-tinta-suave">Solo las ven profesionales y administración. No se pueden editar ni borrar.</p>
              </div>
              {misProf.length > 0 && escribe && (
                <Formulario accion={agregarNota.bind(null, slug, id)} textoBoton="Agregar nota" variante="secundario" limpiar>
                  <AreaTexto id="texto" name="texto" etiqueta="Nueva nota" rows={4} required />
                </Formulario>
              )}
              {(notas.data ?? []).length === 0 ? (
                <Vacio>Sin notas.</Vacio>
              ) : (
                <ul className="flex flex-col gap-4">
                  {((notas.data ?? []) as unknown as { id: string; texto: string; creada_en: string; profesionales: { nombre_visible: string } | null }[]).map(
                    (n) => (
                      <li key={n.id} className="rounded-xl bg-fondo p-4">
                        <div className="mb-1 text-[13px] font-semibold text-tinta-suave">
                          {n.profesionales?.nombre_visible} · {formatoFechaHora(n.creada_en)}
                        </div>
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{n.texto}</p>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-tinta-suave">{titulo}</div>
      <div className="font-medium break-words">{valor || "—"}</div>
    </div>
  );
}

function ListaTurnos({
  slug,
  turnos,
  vacio,
}: {
  slug: string;
  turnos: { id: string; inicio: string; estado: EstadoTurno; servicios: { nombre: string } | null; profesionales: { nombre_visible: string } | null }[];
  vacio: string;
}) {
  if (turnos.length === 0) return <p className="text-[15px] text-tinta-suave">{vacio}</p>;
  return (
    <ul className="divide-y divide-borde">
      {turnos.map((t) => {
        const l = partesLocales(t.inicio);
        return (
          <li key={t.id}>
            <Link href={`/c/${slug}/turnos/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:opacity-80">
              <span className="text-[15px]">
                <span className="font-semibold">
                  {formatoFecha(l.fecha)} {l.hora}
                </span>{" "}
                · {t.servicios?.nombre} · {t.profesionales?.nombre_visible}
              </span>
              <EstadoTurnoInsignia estado={t.estado} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
