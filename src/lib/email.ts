import "server-only";

export type Email = { para: string; asunto: string; texto: string; html: string };

/**
 * Envío de email transaccional (Resend). Si no está configurado, no envía y lo
 * informa: la interfaz ofrece copiar el enlace para mandarlo por otro medio.
 * Nunca incluir información clínica en los emails.
 */
export async function enviarEmail(e: Email): Promise<{ enviado: boolean; motivo?: string }> {
  const clave = process.env.RESEND_API_KEY;
  const desde = process.env.EMAIL_FROM;
  if (!clave || !desde) return { enviado: false, motivo: "sin_configurar" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: desde, to: [e.para], subject: e.asunto, text: e.texto, html: e.html }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? { enviado: true } : { enviado: false, motivo: `http_${r.status}` };
  } catch {
    return { enviado: false, motivo: "error_red" };
  }
}

export function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
