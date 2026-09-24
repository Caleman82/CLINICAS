import { z } from "zod";

export const esquemaClave = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña es demasiado larga.")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número.");

export const esquemaEmail = z.string().trim().toLowerCase().email("Ingresá un email válido.");

export const esquemaNombre = z.string().trim().min(2, "Ingresá el nombre completo.").max(120);

export const esquemaSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones (ej.: cemer).")
  .max(60);

export const esquemaRol = z.enum(["admin_clinica", "recepcion", "profesional"]);

export type Rol = z.infer<typeof esquemaRol>;

export const nombresRol: Record<Rol, string> = {
  admin_clinica: "Administración",
  recepcion: "Recepción",
  profesional: "Profesional",
};
