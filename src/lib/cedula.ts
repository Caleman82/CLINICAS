/** Quita puntos, guiones y espacios: "1.234.567-2" → "12345672". */
export function normalizarCedula(valor: string): string {
  return valor.replace(/[\s.\-_]/g, "");
}

/** Valida una cédula uruguaya (con dígito verificador). Recibe la cédula normalizada. */
export function cedulaValida(cedula: string): boolean {
  if (!/^\d{6,8}$/.test(cedula)) return false;
  const base = cedula.slice(0, -1).padStart(7, "0");
  const pesos = [2, 9, 8, 7, 6, 3, 4];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(base[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(cedula.at(-1));
}

/** "12345672" → "1.234.567-2" */
export function formatoCedula(cedula: string): string {
  const base = cedula.slice(0, -1);
  return `${base.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${cedula.at(-1)}`;
}

/** Celular: solo dígitos y un + inicial opcional. */
export function normalizarCelular(valor: string): string {
  const limpio = valor.trim().replace(/[^\d+]/g, "");
  return limpio.startsWith("+") ? "+" + limpio.slice(1).replace(/\+/g, "") : limpio.replace(/\+/g, "");
}
