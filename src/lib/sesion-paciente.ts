import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoSuscripcion } from "@/lib/sesion";

export type MarcaClinica = {
  id: string;
  nombre: string;
  slug: string;
  logo_url: string | null;
  color_primario: string;
  telefono_contacto: string | null;
  direccion: string | null;
  estado_suscripcion: EstadoSuscripcion;
  horas_limite_cancelacion: number;
};

/**
 * Marca y contacto públicos de la clínica (para la pantalla de ingreso de la app).
 * Solo campos no sensibles: nunca datos de suscripción ni de pacientes.
 */
export const marcaClinica = cache(async (slug: string): Promise<MarcaClinica | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await crearClienteAdmin()
    .from("clinicas")
    .select("id, nombre, slug, logo_url, color_primario, telefono_contacto, direccion, estado_suscripcion, horas_limite_cancelacion")
    .eq("slug", slug)
    .maybeSingle();
  return (data as MarcaClinica | null) ?? null;
});

export type PacienteSesion = { id: string; nombre: string; apellido: string };

/** Paciente con sesión en ESTA clínica (su propia ficha, con acceso activo). */
export const obtenerPaciente = cache(async (slug: string): Promise<{ marca: MarcaClinica; paciente: PacienteSesion | null; userId: string | null } | null> => {
  const marca = await marcaClinica(slug);
  if (!marca) return null;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { marca, paciente: null, userId: null };
  // Filtrar por user_id: si quien navega es del equipo, RLS le mostraría otras fichas.
  const { data } = await supabase
    .from("pacientes")
    .select("id, nombre, apellido")
    .eq("clinica_id", marca.id)
    .eq("user_id", user.id)
    .eq("estado_acceso", "activo")
    .maybeSingle();
  return { marca, paciente: data ?? null, userId: user.id };
});

export async function exigirPaciente(slug: string) {
  const r = await obtenerPaciente(slug);
  if (!r) notFound();
  if (r.marca.estado_suscripcion === "suspendida") return { marca: r.marca, paciente: null, suspendida: true as const };
  if (!r.paciente) redirect(`/p/${slug}/ingresar`);
  return { marca: r.marca, paciente: r.paciente, suspendida: false as const };
}
