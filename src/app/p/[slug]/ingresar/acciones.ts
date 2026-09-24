"use server";

import { redirect } from "next/navigation";
import { cedulaValida, normalizarCedula } from "@/lib/cedula";
import { estaBloqueado, ipCliente, MENSAJE_BLOQUEO, registrarIntento } from "@/lib/limite-intentos";
import { marcaClinica } from "@/lib/sesion-paciente";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/server";

export type EstadoIngresoPaciente = { error?: string; cedula?: string };

// Mismo mensaje para cédula inexistente, sin activar o clave incorrecta: no se revela
// si alguien es paciente de la clínica (es un dato sensible).
const ERROR_GENERICO =
  "La cédula o la contraseña no son correctas. Si todavía no creaste tu contraseña, usá el enlace que te envió la clínica.";

export async function ingresarPaciente(slug: string, _prev: EstadoIngresoPaciente, fd: FormData): Promise<EstadoIngresoPaciente> {
  const cedulaIngresada = String(fd.get("cedula") ?? "");
  const cedula = normalizarCedula(cedulaIngresada);
  const clave = String(fd.get("clave") ?? "");
  if (!cedulaValida(cedula)) return { error: "Revisá la cédula: tiene que ser una cédula válida, con o sin puntos y guión.", cedula: cedulaIngresada };
  if (!clave || clave.length > 200) return { error: "Ingresá tu contraseña.", cedula: cedulaIngresada };

  const marca = await marcaClinica(slug);
  if (!marca) return { error: ERROR_GENERICO, cedula: cedulaIngresada };

  const identificador = `paciente:${slug}:${cedula}`;
  const ip = await ipCliente();
  if (await estaBloqueado(identificador, ip)) return { error: MENSAJE_BLOQUEO, cedula: cedulaIngresada };

  // Se busca la identidad por la ficha (no por la cédula), así sigue funcionando si la clínica corrige la cédula.
  const admin = crearClienteAdmin();
  const { data: ficha } = await admin
    .from("pacientes")
    .select("user_id, estado_acceso")
    .eq("clinica_id", marca.id)
    .eq("cedula", cedula)
    .maybeSingle();
  const email = ficha?.user_id ? (await admin.auth.admin.getUserById(ficha.user_id)).data.user?.email : null;

  const supabase = await crearClienteServidor();
  const { error } = email ? await supabase.auth.signInWithPassword({ email, password: clave }) : { error: true };
  await registrarIntento(identificador, ip, !error);
  if (error) return { error: ERROR_GENERICO, cedula: cedulaIngresada };

  if (ficha?.estado_acceso !== "activo") {
    await supabase.auth.signOut();
    return { error: "Tu acceso a la app está desactivado. Comunicate con la clínica.", cedula: cedulaIngresada };
  }
  redirect(`/p/${slug}`);
}
