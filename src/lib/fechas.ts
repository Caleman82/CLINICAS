// Manejo de fechas en la zona horaria de la clínica (por defecto America/Montevideo).
// En la base todo se guarda como instante (timestamptz); acá se convierte a/desde
// fecha y hora locales. No depende de la zona del servidor.

export const ZONA_POR_DEFECTO = "America/Montevideo";

export type PartesLocales = { fecha: string; hora: string; diaSemana: number; minutos: number };

const formateadores = new Map<string, Intl.DateTimeFormat>();
function formateador(zona: string) {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    formateadores.set(zona, f);
  }
  return f;
}

const DIAS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Fecha (YYYY-MM-DD), hora (HH:MM), día ISO (1 = lunes) y minutos desde medianoche, en la zona dada. */
export function partesLocales(instante: Date | string, zona = ZONA_POR_DEFECTO): PartesLocales {
  const p = Object.fromEntries(formateador(zona).formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  const hora = `${p.hour}:${p.minute}`;
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora,
    diaSemana: DIAS[p.weekday],
    minutos: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante. */
function desfase(instante: number, zona: string): number {
  const p = Object.fromEntries(formateador(zona).formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/** Convierte fecha (YYYY-MM-DD) y hora (HH:MM) locales a un instante. */
export function aInstante(fecha: string, hora: string, zona = ZONA_POR_DEFECTO): Date {
  if (!esFecha(fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("Fecha u hora inválida");
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, h, min);
  // Dos pasadas para cubrir cambios de horario.
  let t = ingenuo - desfase(ingenuo, zona);
  t = ingenuo - desfase(t, zona);
  return new Date(t);
}

export function esFecha(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Suma días a una fecha YYYY-MM-DD (calendario, sin zona). */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Día ISO de una fecha YYYY-MM-DD (1 = lunes … 7 = domingo). */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dia === 0 ? 7 : dia;
}

/** Lunes de la semana de la fecha. */
export function inicioSemana(fecha: string): string {
  return sumarDias(fecha, 1 - diaSemana(fecha));
}

export function hoy(zona = ZONA_POR_DEFECTO): string {
  return partesLocales(new Date(), zona).fecha;
}

export function minutosAHora(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

const NOMBRES_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function nombreDia(dia: number): string {
  return NOMBRES_DIA[dia - 1];
}

/** "jueves 1 de octubre de 2026" */
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${nombreDia(diaSemana(fecha))} ${d} de ${NOMBRES_MES[m - 1]} de ${a}`;
}

/** "jue 1/10" */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split("-").map(Number);
  return `${nombreDia(diaSemana(fecha)).slice(0, 3)} ${d}/${m}`;
}

export type Franja = { inicio: number; fin: number };

/** Rango horario a mostrar en la grilla: une los horarios de atención y los turnos, con márgenes por defecto. */
export function rangoGrilla(franjas: Franja[], porDefecto: Franja = { inicio: 8 * 60, fin: 20 * 60 }): Franja {
  if (franjas.length === 0) return porDefecto;
  const inicio = Math.min(...franjas.map((f) => f.inicio));
  const fin = Math.max(...franjas.map((f) => f.fin));
  return { inicio: Math.floor(inicio / 60) * 60, fin: Math.min(24 * 60, Math.ceil(fin / 60) * 60) };
}

/** ¿El intervalo [inicio, fin) cae completo dentro de alguna franja de atención? */
export function dentroDeHorario(inicio: number, fin: number, franjas: Franja[]): boolean {
  return franjas.some((f) => inicio >= f.inicio && fin <= f.fin);
}

/**
 * Distribuye turnos superpuestos en carriles (para dibujarlos lado a lado en una columna).
 * En una columna de profesional no debería haber superposición, pero sí al filtrar por recurso
 * o con turnos cancelados.
 */
export function asignarCarriles<T extends { inicio: number; fin: number }>(items: T[]): (T & { carril: number; carriles: number })[] {
  const orden = [...items].sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);
  const salida: (T & { carril: number; carriles: number })[] = [];
  let grupo: (T & { carril: number; carriles: number })[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(1, ...grupo.map((g) => g.carril + 1));
    grupo.forEach((g) => (g.carriles = n));
    salida.push(...grupo);
    grupo = [];
  };
  for (const it of orden) {
    if (it.inicio >= finGrupo && grupo.length) cerrar();
    const ocupados = new Set(grupo.filter((g) => g.fin > it.inicio).map((g) => g.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    grupo.push({ ...it, carril, carriles: 1 });
    finGrupo = Math.max(finGrupo, it.fin);
  }
  if (grupo.length) cerrar();
  return salida;
}
