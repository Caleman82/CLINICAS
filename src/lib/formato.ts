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
  return new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, dateStyle: "short", timeStyle: "short" }).format(new Date(instante));
}
