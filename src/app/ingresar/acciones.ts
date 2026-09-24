"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { estaBloqueado, ipCliente, MENSAJE_BLOQUEO, registrarIntento } from "@/lib/limite-intentos";
import { destinoInicial, type ClinicaDelUsuario } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esquemaEmail } from "@/lib/validacion";

export type EstadoIngreso = { error?: string; email?: string };

const esquema = z.object({ email: esquemaEmail, clave: z.string().min(1, "Ingresá tu contraseña.").max(200) });

export async function ingresar(_prev: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  const datos = esquema.safeParse({ email: formData.get("email"), clave: formData.get("clave") });
  const email = String(formData.get("email") ?? "");
  if (!datos.success) return { error: datos.error.issues[0].message, email };

  const ip = await ipCliente();
  if (await estaBloqueado(datos.data.email, ip)) return { error: MENSAJE_BLOQUEO, email };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: datos.data.email,
    password: datos.data.clave,
  });
  await registrarIntento(datos.data.email, ip, !error);
  if (error || !data.user) return { error: "El email o la contraseña no son correctos.", email };

  const [admin, clinicas] = await Promise.all([
    supabase.from("plataforma_admins").select("user_id").maybeSingle(),
    supabase.rpc("mis_clinicas"),
  ]);
  const ctx = {
    userId: data.user.id,
    email: data.user.email ?? "",
    superadmin: !!admin.data,
    clinicas: (clinicas.data ?? []) as ClinicaDelUsuario[],
  };

  if (!ctx.superadmin && ctx.clinicas.length === 0) {
    await supabase.auth.signOut();
    return { error: "Tu usuario no tiene un acceso activo al panel. Consultá con el administrador de tu clínica.", email };
  }

  redirect(destinoInicial(ctx));
}
