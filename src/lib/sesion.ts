import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Rol } from "@/lib/validacion";

export type EstadoSuscripcion = "activa" | "gracia" | "solo_lectura" | "suspendida";

export type ClinicaDelUsuario = {
  clinica_id: string;
  nombre: string;
  slug: string;
  color_primario: string;
  estado_suscripcion: EstadoSuscripcion;
  rol: Rol;
};

export type Contexto = {
  userId: string;
  email: string;
  superadmin: boolean;
  clinicas: ClinicaDelUsuario[];
};

/** Usuario autenticado + sus clínicas. Verifica la sesión contra Supabase Auth. */
export const obtenerContexto = cache(async (): Promise<Contexto | null> => {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [admin, clinicas] = await Promise.all([
    supabase.from("plataforma_admins").select("user_id").maybeSingle(),
    supabase.rpc("mis_clinicas"),
  ]);

  return {
    userId: user.id,
    email: user.email ?? "",
    superadmin: !!admin.data,
    clinicas: (clinicas.data ?? []) as ClinicaDelUsuario[],
  };
});

export async function exigirSesion(): Promise<Contexto> {
  const ctx = await obtenerContexto();
  if (!ctx) redirect("/ingresar");
  return ctx;
}

export async function exigirSuperadmin(): Promise<Contexto> {
  const ctx = await exigirSesion();
  if (!ctx.superadmin) notFound();
  return ctx;
}

/** Clínica por slug, solo si el usuario es miembro activo. */
export async function exigirClinica(slug: string, roles?: Rol[]) {
  const ctx = await exigirSesion();
  const clinica = ctx.clinicas.find((c) => c.slug === slug);
  if (!clinica) notFound();
  if (roles && !roles.includes(clinica.rol)) notFound();
  return { ctx, clinica };
}

/** Destino inicial después de ingresar. */
export function destinoInicial(ctx: Contexto): string {
  if (ctx.superadmin) return "/proveedor";
  if (ctx.clinicas.length === 1) return `/c/${ctx.clinicas[0].slug}`;
  if (ctx.clinicas.length > 1) return "/elegir-clinica";
  return "/sin-acceso";
}
