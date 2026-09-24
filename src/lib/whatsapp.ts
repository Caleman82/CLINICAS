/**
 * Enlace "click to chat" de WhatsApp (abre el WhatsApp de quien lo toca con el
 * mensaje escrito). Es el envío manual hasta tener la API de WhatsApp Business (fase 4).
 * Celulares uruguayos: 09XXXXXXX → 5989XXXXXXX.
 */
export function numeroWhatsApp(celular: string | null | undefined): string | null {
  if (!celular) return null;
  const d = celular.replace(/\D/g, "");
  if (/^09\d{7}$/.test(d)) return `598${d.slice(1)}`;
  if (/^598\d{8}$/.test(d)) return d;
  if (celular.trim().startsWith("+") && d.length >= 8) return d;
  return null;
}

export function enlaceWhatsApp(celular: string | null | undefined, texto: string): string | null {
  const n = numeroWhatsApp(celular);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}
