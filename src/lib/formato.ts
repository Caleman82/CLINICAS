const ZONA = "America/Montevideo";

export function formatoPesos(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 }).format(Number(valor));
}

/** Fecha (YYYY-MM-DD de la base, sin hora) en formato dd/mm/aaaa. */
export function formatoFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatoFechaHora(instante: string | null | undefined): string {
  if (!instante) return "—";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instante));
}
