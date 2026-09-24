import Link from "next/link";
import { Suspense } from "react";
import { EnlaceBoton, Mensaje, Titulo } from "@/components/ui";
import { cargarConfiguracion, misProfesionales } from "@/lib/datos-clinica";
import {
  aInstante, diaSemana, esFecha, fechaCorta, fechaLarga, horaAMinutos, hoy, inicioSemana, partesLocales, rangoGrilla, sumarDias,
  type Franja,
} from "@/lib/fechas";
import { exigirClinica, puedeEscribir, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoTurno } from "@/lib/turnos";
import { FiltrosAgenda } from "./_agenda/filtros";
import { Grilla, type Columna, type TurnoGrilla } from "./_agenda/grilla";

type Busqueda = { fecha?: string; vista?: string; prof?: string; recurso?: string; turno?: string };

type FilaTurno = {
  id: string;
  inicio: string;
  fin: string;
  estado: EstadoTurno;
  profesional_id: string;
  recurso_id: string | null;
  pacientes: { nombre: string; apellido: string } | null;
  servicios: { nombre: string } | null;
};

/** Minutos locales de un intervalo recortado al día dado. */
function recortarAlDia(inicio: string, fin: string, fecha: string): Franja | null {
  const i = partesLocales(inicio);
  const f = partesLocales(fin);
  if (f.fecha < fecha || i.fecha > fecha) return null;
  return { inicio: i.fecha < fecha ? 0 : i.minutos, fin: f.fecha > fecha ? 24 * 60 : f.minutos };
}

export default async function Agenda({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Busqueda> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { ctx, clinica } = await exigirClinica(slug);
  const fecha = sp.fecha && esFecha(sp.fecha) ? sp.fecha : hoy();
  const semana = sp.vista === "semana";
  const esProfesional = clinica.rol === "profesional";
  const gestion = ROLES_GESTION.includes(clinica.rol);
  const escribe = puedeEscribir(clinica);

  const config = await cargarConfiguracion(clinica.clinica_id);
  const propios = esProfesional ? await misProfesionales(clinica.clinica_id, ctx.userId) : [];
  // Un profesional ve solo su agenda (la base igual no le devuelve turnos ajenos).
  const disponibles = config.profesionales.filter((p) => p.activo && (!esProfesional || propios.includes(p.id)));
  const recursoFiltro = config.recursos.find((r) => r.id === sp.recurso);

  let visibles = sp.prof ? disponibles.filter((p) => p.id === sp.prof) : disponibles;
  if (semana && visibles.length > 1) visibles = visibles.slice(0, 1);

  const dias = semana ? Array.from({ length: 7 }, (_, i) => sumarDias(inicioSemana(fecha), i)) : [fecha];
  const desde = aInstante(dias[0], "00:00").toISOString();
  const hasta = aInstante(sumarDias(dias.at(-1)!, 1), "00:00").toISOString();

  const supabase = await crearClienteServidor();
  let consultaTurnos = supabase
    .from("turnos")
    .select("id, inicio, fin, estado, profesional_id, recurso_id, pacientes(nombre, apellido), servicios(nombre)")
    .eq("clinica_id", clinica.clinica_id)
    .neq("estado", "cancelado")
    .lt("inicio", hasta)
    .gt("fin", desde)
    .in("profesional_id", visibles.map((p) => p.id));
  if (recursoFiltro) consultaTurnos = consultaTurnos.eq("recurso_id", recursoFiltro.id);
  const [{ data: turnosData }, { data: bloqueosData }, { data: canceladosData }] = await Promise.all([
    consultaTurnos,
    supabase
      .from("bloqueos_agenda")
      .select("profesional_id, recurso_id, desde, hasta, motivo")
      .eq("clinica_id", clinica.clinica_id)
      .lt("desde", hasta)
      .gt("hasta", desde),
    // Cancelaciones hechas por pacientes desde la app, para que recepción las vea.
    supabase
      .from("turnos")
      .select("id, inicio, pacientes(nombre, apellido)")
      .eq("clinica_id", clinica.clinica_id)
      .eq("cancelado_por_paciente", true)
      .lt("inicio", hasta)
      .gt("fin", desde)
      .in("profesional_id", visibles.map((p) => p.id))
      .order("inicio"),
  ]);
  const cancelados = (canceladosData ?? []) as unknown as { id: string; inicio: string; pacientes: { nombre: string; apellido: string } | null }[];
  const turnos = (turnosData ?? []) as unknown as FilaTurno[];
  const bloqueos = bloqueosData ?? [];
  const nombreRecurso = new Map(config.recursos.map((r) => [r.id, r.nombre]));
  const hoyLocal = hoy();
  const puedeAgendar = gestion && escribe;

  const armarColumna = (prof: (typeof visibles)[number], dia: string, titulo: string, subtitulo?: string): Columna => {
    const franjas = config.horarios
      .filter((h) => h.profesional_id === prof.id && h.dia_semana === diaSemana(dia))
      .map((h) => ({ inicio: horaAMinutos(h.hora_inicio), fin: horaAMinutos(h.hora_fin) }));
    const suyos: TurnoGrilla[] = turnos
      .filter((t) => t.profesional_id === prof.id)
      .flatMap((t) => {
        const r = recortarAlDia(t.inicio, t.fin, dia);
        return r
          ? [{
              id: t.id,
              ...r,
              estado: t.estado,
              paciente: t.pacientes ? `${t.pacientes.nombre} ${t.pacientes.apellido}` : "Paciente",
              servicio: t.servicios?.nombre ?? "",
              recurso: t.recurso_id ? (nombreRecurso.get(t.recurso_id) ?? null) : null,
              color: prof.color_agenda,
            }]
          : [];
      });
    const susBloqueos = bloqueos
      .filter((b) => b.profesional_id === prof.id || (recursoFiltro && b.recurso_id === recursoFiltro.id))
      .flatMap((b) => {
        const r = recortarAlDia(b.desde, b.hasta, dia);
        return r ? [{ ...r, motivo: b.motivo }] : [];
      });
    return {
      clave: `${prof.id}-${dia}`,
      titulo,
      subtitulo,
      color: semana ? undefined : prof.color_agenda,
      franjas: config.horarios.some((h) => h.profesional_id === prof.id) ? franjas : [{ inicio: 0, fin: 24 * 60 }],
      bloqueos: susBloqueos,
      turnos: suyos,
      hrefNuevo: puedeAgendar ? `/c/${slug}/turnos/nuevo?prof=${prof.id}&fecha=${dia}` : null,
      esHoy: dia === hoyLocal,
    };
  };

  const columnas: Columna[] = semana
    ? visibles.length
      ? dias.map((d) => armarColumna(visibles[0], d, fechaCorta(d)))
      : []
    : visibles.map((p) => armarColumna(p, fecha, p.nombre_visible, p.especialidad ?? undefined));

  const rango = rangoGrilla([
    ...columnas.flatMap((c) => c.franjas.filter((f) => f.fin - f.inicio < 24 * 60)),
    ...columnas.flatMap((c) => c.turnos.map((t) => ({ inicio: t.inicio, fin: t.fin }))),
  ]);
  const ahoraLocal = partesLocales(new Date());

  const paso = semana ? 7 : 1;
  const enlace = (f: string) => {
    const u = new URLSearchParams(Object.entries({ ...sp, fecha: f, turno: undefined }).filter(([, v]) => v) as [string, string][]);
    return `/c/${slug}?${u}`;
  };
  const totales = turnos.filter((t) => t.estado !== "no_asistio").length;
  const confirmados = turnos.filter((t) => t.estado === "confirmado").length;
  const piden = turnos.filter((t) => t.estado === "reprogramar_solicitado").length;

  return (
    <>
      <Titulo
        detalle={semana ? `Semana del ${fechaCorta(dias[0])} al ${fechaCorta(dias[6])}` : fechaLarga(fecha)}
        acciones={
          puedeAgendar && (
            <>
              <EnlaceBoton href={`/c/${slug}/bloqueos`} variante="secundario">
                Bloqueos
              </EnlaceBoton>
              <EnlaceBoton href={`/c/${slug}/turnos/nuevo?fecha=${fecha}`}>Nuevo turno</EnlaceBoton>
            </>
          )
        }
      >
        {semana ? "Agenda de la semana" : fecha === hoyLocal ? "Agenda del día" : "Agenda"}
      </Titulo>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={enlace(sumarDias(fecha, -paso))} className="flex h-10 items-center rounded-[10px] border border-borde-campo bg-superficie px-3 font-semibold hover:bg-fondo" aria-label="Anterior">
            ←
          </Link>
          <Link href={enlace(hoyLocal)} className="flex h-10 items-center rounded-[10px] border border-borde-campo bg-superficie px-4 font-semibold hover:bg-fondo">
            Hoy
          </Link>
          <Link href={enlace(sumarDias(fecha, paso))} className="flex h-10 items-center rounded-[10px] border border-borde-campo bg-superficie px-3 font-semibold hover:bg-fondo" aria-label="Siguiente">
            →
          </Link>
          <form className="flex items-center gap-2">
            {Object.entries(sp)
              .filter(([k, v]) => v && k !== "fecha" && k !== "turno")
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <label htmlFor="ir-fecha" className="sr-only">
              Ir a fecha
            </label>
            <input id="ir-fecha" name="fecha" type="date" defaultValue={fecha} className="h-10 rounded-[10px] border border-borde-campo bg-superficie px-3" />
            <button className="h-10 rounded-[10px] px-3 font-semibold text-marca hover:bg-marca-clara">Ir</button>
          </form>
        </div>
        <Suspense>
          <FiltrosAgenda
            profesionales={disponibles.map((p) => ({ id: p.id, nombre: p.nombre_visible }))}
            recursos={config.recursos.filter((r) => r.activo).map((r) => ({ id: r.id, nombre: r.nombre }))}
            mostrarProfesional={disponibles.length > 1}
            profActual={semana ? (visibles[0]?.id ?? "") : (sp.prof ?? "")}
          />
        </Suspense>
      </div>

      {disponibles.length === 0 ? (
        <Mensaje tipo="info">
          {esProfesional
            ? "Tu usuario todavía no está vinculado a una ficha de profesional. Pedíselo a la administración."
            : clinica.rol === "admin_clinica"
              ? "Para empezar a usar la agenda, cargá profesionales, servicios y horarios en Configuración."
              : "Todavía no hay profesionales cargados."}
        </Mensaje>
      ) : (
        <>
          <p className="text-sm text-tinta-suave">
            {totales} {totales === 1 ? "turno" : "turnos"} · {confirmados} confirmados
            {piden > 0 && <span className="font-semibold text-alerta"> · {piden} piden reprogramar</span>}
            {recursoFiltro && ` · filtrando por ${recursoFiltro.nombre}`}
          </p>
          {cancelados.length > 0 && (
            <Mensaje tipo="alerta">
              {cancelados.length === 1 ? "1 turno fue cancelado" : `${cancelados.length} turnos fueron cancelados`} por el paciente desde la app:{" "}
              {cancelados.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/c/${slug}/turnos/${c.id}`} className="font-semibold underline">
                    {c.pacientes?.nombre} {c.pacientes?.apellido} ({semana ? `${fechaCorta(partesLocales(c.inicio).fecha)} ` : ""}
                    {partesLocales(c.inicio).hora})
                  </Link>
                </span>
              ))}
              . El horario quedó libre.
            </Mensaje>
          )}
          <Grilla
            slug={slug}
            rango={rango}
            columnas={columnas}
            ahora={dias.includes(ahoraLocal.fecha) ? ahoraLocal.minutos : null}
            resaltado={sp.turno}
          />
        </>
      )}
    </>
  );
}
