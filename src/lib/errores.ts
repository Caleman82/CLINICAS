type ErrorBase = { code?: string; message?: string; hint?: string | null } | null | undefined;

/** Traduce un error de la base (vía PostgREST) a un mensaje para el usuario. */
export function mensajeError(error: ErrorBase, porDefecto = "No se pudo guardar. Probá de nuevo."): string {
  if (!error) return porDefecto;
  const msg = error.message ?? "";
  switch (error.code) {
    case "23P01":
      if (msg.includes("recurso")) return "El recurso ya está ocupado en ese horario.";
      return "El profesional ya tiene un turno en ese horario.";
    case "P0001":
      // Mensajes propios de la base, ya escritos para el usuario.
      return msg.endsWith(".") ? msg : `${msg}.`;
    case "23505":
      if (msg.includes("cedula")) return "Ya existe un paciente con esa cédula en la clínica.";
      return "Ya existe un registro con esos datos.";
    case "23514":
      return "Algún dato no es válido. Revisá el formulario.";
    case "23503":
      return "Hay datos vinculados que no corresponden a esta clínica.";
    case "42501":
      if (msg.includes("row-level security")) return "No tenés permiso para hacer esto, o la clínica está en modo solo lectura.";
      return msg.includes("permission denied") ? "No tenés permiso para hacer esto." : `${msg}.`;
    default:
      return porDefecto;
  }
}

export type EstadoForm = { error?: string; ok?: string };
