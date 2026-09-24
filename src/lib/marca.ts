// Colores de marca de cada clínica, ajustados para que el texto blanco se lea bien.

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

export function contrasteConBlanco(hex: string): number {
  return 1.05 / (luminancia(hex) + 0.05);
}

/** Oscurece el color hasta que el texto blanco tenga contraste ≥ 4.5:1 (WCAG AA). */
export function colorLegible(hex: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return "#1F6F6B";
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let actual = hex.toUpperCase();
  for (let i = 0; i < 20 && contrasteConBlanco(actual) < 4.5; i++) {
    [r, g, b] = [r, g, b].map((c) => Math.round(c * 0.9));
    actual = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  return actual;
}

/** Variables CSS para aplicar la marca de la clínica sobre los tokens del tema. */
export function variablesMarca(hex: string): Record<string, string> {
  const base = colorLegible(hex);
  return {
    "--color-marca": base,
    "--color-marca-oscura": `color-mix(in srgb, ${base} 78%, black)`,
    "--color-marca-clara": `color-mix(in srgb, ${base} 14%, white)`,
  };
}
