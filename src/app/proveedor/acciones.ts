"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitirEnlaceMiembro, invitarMiembro } from "@/lib/invitaciones";
import { exigirSuperadmin } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaEmail, esquemaNombre, esquemaSlug } from "@/lib/validacion";

const opcional = z
  .string()
  .trim()
  .max(200)
  .transform((v) => v || null);

const esquemaClinica = z.object({
  nombre: z.string().trim().min(2, "Ingresá el nombre de la clínica.").max(120),
  slug: esquemaSlug,
  rubro: opcional,
  plan: opcional,
  precio_mensual: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v.replace(",", ".")) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "El precio no es válido."),
  fecha_proximo_cobro: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "La fecha no es válida."),
  telefono_contacto: opcional,
  direccion: opcional,
  admin_nombre: esquemaNombre,
  admin_email: esquemaEmail,
});

export type EstadoAltaClinica = {
  error?: string;
  creada?: { id: string; nombre: string; enlace: string | null; aviso?: string };
};

export async function crearClinica(_prev: EstadoAltaClinica, formData: FormData): Promise<EstadoAltaClinica> {
  const ctx = await exigirSuperadmin();
  const datos = esquemaClinica.safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };
  const { admin_nombre, admin_email, ...clinica } = datos.data;

  // La inserción pasa por RLS: solo un superadmin puede crear clínicas.
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("clinicas").insert(clinica).select("id, nombre").single();
  if (error) {
    if (error.code === "23505") return { error: "Ya existe una clínica con esa dirección (slug)." };
    return { error: "No se pudo crear la clínica." };
  }

  const inv = await invitarMiembro({
    clinicaId: data.id,
    nombre: admin_nombre,
    email: admin_email,
    rol: "admin_clinica",
    creadoPor: ctx.userId,
  });
  revalidatePath("/proveedor");
  if (!inv.ok) {
    return { creada: { id: data.id, nombre: data.nombre, enlace: null, aviso: `La clínica se creó, pero no el administrador: ${inv.error}` } };
  }
  return { creada: { id: data.id, nombre: data.nombre, enlace: inv.enlace } };
}

export type EstadoAdmin = { error?: string; enlace?: string | null; ok?: boolean };

export async function agregarAdmin(clinicaId: string, _prev: EstadoAdmin, formData: FormData): Promise<EstadoAdmin> {
  const ctx = await exigirSuperadmin();
  const datos = z.object({ nombre: esquemaNombre, email: esquemaEmail }).safeParse(Object.fromEntries(formData));
  if (!datos.success) return { error: datos.error.issues[0].message };
  const inv = await invitarMiembro({ clinicaId, ...datos.data, rol: "admin_clinica", creadoPor: ctx.userId });
  if (!inv.ok) return { error: inv.error };
  revalidatePath(`/proveedor/clinicas/${clinicaId}`);
  return { ok: true, enlace: inv.enlace };
}

export async function nuevoEnlaceAdmin(clinicaId: string, membresiaId: string, _prev: EstadoAdmin): Promise<EstadoAdmin> {
  const ctx = await exigirSuperadmin();
  const r = await emitirEnlaceMiembro({ clinicaId, membresiaId, creadoPor: ctx.userId, desdeProveedor: true });
  if (!r.ok) return { error: r.error };
  return { ok: true, enlace: r.enlace };
}
