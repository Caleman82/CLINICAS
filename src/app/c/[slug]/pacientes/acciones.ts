"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cedulaValida, normalizarCedula, normalizarCelular } from "@/lib/cedula";
import { misProfesionales } from "@/lib/datos-clinica";
import { mensajeError, type EstadoForm } from "@/lib/errores";
import { esFecha, hoy } from "@/lib/fechas";
import { invitarPaciente } from "@/lib/invitaciones-paciente";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { autorizarEscritura, ROLES_GESTION } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const esquemaPaciente = z.object({
  nombre: z.string().trim().min(1, "Ingresá el nombre.").max(80),
  apellido: z.string().trim().min(1, "Ingresá el apellido.").max(80),
  cedula: z
    .string()
    .transform(normalizarCedula)
    .refine((v) => /^\d{6,8}$/.test(v), "La cédula debe tener entre 6 y 8 dígitos, sin puntos ni guión.")
    .refine(cedulaValida, "La cédula no es válida: revisá el dígito verificador."),
  fecha_nacimiento: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || (esFecha(v) && v <= hoy() && v >= "1900-01-01"), "La fecha de nacimiento no es válida."),
  celular: z
    .string()
    .transform(normalizarCelular)
    .transform((v) => v || null)
    .refine((v) => v === null || /^\+?\d{8,15}$/.test(v), "El celular no es válido."),
  email: opcional(200).refine((v) => v === null || z.email().safeParse(v).success, "El email no es válido."),
  profesional_referencia_id: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[0-9a-f-]{36}$/.test(v), "Profesional no válido."),
});

export async function crearPaciente(slug: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  if (fd.get("consentimiento") !== "on") {
    return { error: "Para dar de alta al paciente tenés que registrar su consentimiento." };
  }
  const d = esquemaPaciente.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("pacientes")
    .insert({
      ...d.data,
      clinica_id: a.clinica.clinica_id,
      consentimiento_registrado: true,
      consentimiento_fecha: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/c/${slug}/pacientes`);
  redirect(`/c/${slug}/pacientes/${data.id}?nuevo=1`);
}

export async function editarPaciente(slug: string, id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const d = esquemaPaciente.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("pacientes").update(d.data).eq("id", id).eq("clinica_id", a.clinica.clinica_id).select("id");
  if (error) return { error: mensajeError(error) };
  if (!data.length) return { error: "No se encontró el paciente." };
  revalidatePath(`/c/${slug}/pacientes/${id}`);
  redirect(`/c/${slug}/pacientes/${id}`);
}

export async function cambiarAccesoPaciente(slug: string, id: string, estado: "activo" | "desactivado", _prev: EstadoForm): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("pacientes")
    .update({ estado_acceso: estado })
    .eq("id", id)
    .eq("clinica_id", a.clinica.clinica_id)
    .not("user_id", "is", null)
    .select("id");
  if (error) return { error: mensajeError(error) };
  if (!data.length) return { error: "El paciente todavía no activó su cuenta." };
  revalidatePath(`/c/${slug}/pacientes/${id}`);
  return { ok: estado === "activo" ? "Acceso reactivado." : "Acceso desactivado. Se cerraron sus sesiones." };
}

const esquemaPaquete = z.object({
  servicio_id: z.string().regex(/^[0-9a-f-]{36}$/, "Elegí el servicio."),
  sesiones_totales: z.coerce.number().int().min(1, "Mínimo 1 sesión.").max(200, "Máximo 200 sesiones."),
  vence_en: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || esFecha(v), "La fecha de vencimiento no es válida."),
});

export async function crearPaquete(slug: string, pacienteId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  const d = esquemaPaquete.safeParse(Object.fromEntries(fd));
  if (!d.success) return { error: d.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("paquetes").insert({ ...d.data, paciente_id: pacienteId, clinica_id: a.clinica.clinica_id });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/c/${slug}/pacientes/${pacienteId}`);
  return { ok: "Paquete creado." };
}

export async function agregarNota(slug: string, pacienteId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ["admin_clinica", "profesional"]);
  if (!a.ok) return { error: a.error };
  const texto = String(fd.get("texto") ?? "").trim();
  if (!texto) return { error: "Escribí la nota." };
  if (texto.length > 10000) return { error: "La nota es demasiado larga." };
  const [profesionalId] = await misProfesionales(a.clinica.clinica_id, a.ctx.userId);
  if (!profesionalId) return { error: "Tu usuario no está vinculado a una ficha de profesional." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("notas_clinicas")
    .insert({ clinica_id: a.clinica.clinica_id, paciente_id: pacienteId, profesional_id: profesionalId, texto });
  if (error) return { error: mensajeError(error, "No se pudo guardar la nota.") };
  revalidatePath(`/c/${slug}/pacientes/${pacienteId}`);
  return { ok: "Nota agregada." };
}

export async function guardarCampos(slug: string, pacienteId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const a = await autorizarEscritura(slug, ["admin_clinica", "recepcion", "profesional"]);
  if (!a.ok) return { error: a.error };
  const filas = [...fd.entries()]
    .filter(([k]) => k.startsWith("campo:") && /^[0-9a-f-]{36}$/.test(k.slice(6)))
    .map(([k, v]) => ({
      clinica_id: a.clinica.clinica_id,
      paciente_id: pacienteId,
      campo_id: k.slice(6),
      valor: String(v).trim().slice(0, 2000) || null,
    }));
  if (!filas.length) return {};
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("valores_campos").upsert(filas, { onConflict: "paciente_id,campo_id" });
  if (error) return { error: mensajeError(error) };
  revalidatePath(`/c/${slug}/pacientes/${pacienteId}`);
  return { ok: "Datos guardados." };
}

export type EstadoInvitacion = EstadoForm & { enlace?: string; whatsapp?: string | null; emailEnviado?: boolean; email?: string | null };

export async function invitarPacienteApp(slug: string, id: string, _prev: EstadoInvitacion): Promise<EstadoInvitacion> {
  const a = await autorizarEscritura(slug, ROLES_GESTION);
  if (!a.ok) return { error: a.error };
  // Verificación con la sesión del usuario (RLS): el paciente es de su clínica.
  const supabase = await crearClienteServidor();
  const { data: p } = await supabase.from("pacientes").select("id").eq("id", id).eq("clinica_id", a.clinica.clinica_id).maybeSingle();
  if (!p) return { error: "No se encontró el paciente." };

  const r = await invitarPaciente({
    clinicaId: a.clinica.clinica_id,
    slug,
    clinicaNombre: a.clinica.nombre,
    pacienteId: id,
    creadoPor: a.ctx.userId,
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/c/${slug}/pacientes/${id}`);
  const texto = r.renovacion
    ? `Hola ${r.nombre}, te enviamos el enlace para crear una nueva contraseña en la app de ${a.clinica.nombre} (vence en 72 horas y sirve una sola vez): ${r.enlace}`
    : `Hola ${r.nombre}, ${a.clinica.nombre} te invita a su app para ver y confirmar tus turnos. Creá tu contraseña en este enlace (vence en 72 horas y sirve una sola vez): ${r.enlace}\nTu usuario es tu cédula.`;
  return {
    ok: r.emailEnviado ? `Enviamos el enlace por email a ${r.email}.` : "Enlace generado. El anterior dejó de funcionar.",
    enlace: r.enlace,
    whatsapp: enlaceWhatsApp(r.celular, texto),
    emailEnviado: r.emailEnviado,
    email: r.email,
  };
}
