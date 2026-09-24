import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { generarToken, hashToken, VIGENCIA_INVITACION_HORAS } from "@/lib/tokens";
import type { Rol } from "@/lib/validacion";

type Resultado<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Suma a una persona al equipo de una clínica.
 * - Si no tiene cuenta: se crea su identidad (sin contraseña) y se genera un enlace
 *   de activación de un solo uso para que ella misma cree su clave.
 * - Si ya tiene cuenta (trabaja en otra clínica del sistema): solo se agrega la
 *   membresía y sigue entrando con su clave de siempre. NUNCA se genera un enlace
 *   para cambiarle la clave, porque eso permitiría tomar una cuenta ajena.
 *
 * Quien llama debe haber verificado antes que el usuario actual puede hacerlo.
 */
export async function invitarMiembro(params: {
  clinicaId: string;
  nombre: string;
  email: string;
  rol: Rol;
  creadoPor: string;
}): Promise<Resultado<{ enlace: string | null }>> {
  const admin = crearClienteAdmin(params.creadoPor);

  const existente = await admin.rpc("srv_usuario_por_email", { p_email: params.email });
  if (existente.error) return { ok: false, error: "No se pudo verificar el email. Probá de nuevo." };

  let userId = existente.data as string | null;
  const esNuevo = !userId;

  if (!userId) {
    const creado = await admin.auth.admin.createUser({ email: params.email, email_confirm: true });
    if (creado.error || !creado.data.user) return { ok: false, error: "No se pudo crear el usuario." };
    userId = creado.data.user.id;
  }

  const membresia = await admin
    .from("membresias")
    .insert({ clinica_id: params.clinicaId, user_id: userId, rol: params.rol, nombre: params.nombre, email: params.email })
    .select("id")
    .single();

  if (membresia.error) {
    if (esNuevo) await admin.auth.admin.deleteUser(userId);
    if (membresia.error.code === "23505") return { ok: false, error: "Esa persona ya es parte del equipo de esta clínica." };
    return { ok: false, error: "No se pudo agregar al equipo." };
  }

  if (!esNuevo) return { ok: true, enlace: null };

  const enlace = await emitirEnlaceMiembro({
    membresiaId: membresia.data.id,
    clinicaId: params.clinicaId,
    creadoPor: params.creadoPor,
  });
  if (!enlace.ok) return enlace;
  return { ok: true, enlace: enlace.enlace };
}

/**
 * Genera un enlace de un solo uso (72 h) para que un miembro cree o renueve su clave.
 * Invalida los enlaces anteriores de esa membresía.
 * Si lo pide el admin de una clínica, solo se permite si la persona pertenece
 * ÚNICAMENTE a esa clínica: así no puede cambiar la clave de alguien que también
 * trabaja en otra. El proveedor (desdeProveedor) sí puede. Nunca para un superadmin.
 */
export async function emitirEnlaceMiembro(params: {
  membresiaId: string;
  clinicaId: string;
  creadoPor: string;
  desdeProveedor?: boolean;
}): Promise<Resultado<{ enlace: string }>> {
  const admin = crearClienteAdmin(params.creadoPor);

  const { data: membresia } = await admin
    .from("membresias")
    .select("id, user_id, clinica_id, activo")
    .eq("id", params.membresiaId)
    .eq("clinica_id", params.clinicaId)
    .maybeSingle();
  if (!membresia) return { ok: false, error: "No se encontró el miembro del equipo." };
  if (!membresia.activo) return { ok: false, error: "El acceso de esta persona está desactivado. Reactivalo primero." };

  const [otras, superadmin] = await Promise.all([
    admin.from("membresias").select("id", { count: "exact", head: true }).eq("user_id", membresia.user_id).neq("clinica_id", params.clinicaId),
    admin.from("plataforma_admins").select("user_id").eq("user_id", membresia.user_id).maybeSingle(),
  ]);
  if (otras.error || superadmin.error) return { ok: false, error: "No se pudo generar el enlace." };
  if (superadmin.data) return { ok: false, error: "No se pueden generar enlaces para cuentas del proveedor." };
  if ((otras.count ?? 0) > 0 && !params.desdeProveedor) {
    return {
      ok: false,
      error: "Esta persona también trabaja en otra clínica del sistema. Para cambiar su clave, contactá a soporte.",
    };
  }

  await admin.from("invitaciones").delete().eq("membresia_id", membresia.id).is("usada_en", null);

  const { token, hash } = generarToken();
  const vence = new Date(Date.now() + VIGENCIA_INVITACION_HORAS * 3600_000);
  const insercion = await admin.from("invitaciones").insert({
    clinica_id: params.clinicaId,
    membresia_id: membresia.id,
    token_hash: hash,
    vence_en: vence.toISOString(),
    canal: "enlace",
    creado_por: params.creadoPor,
  });
  if (insercion.error) return { ok: false, error: "No se pudo generar el enlace." };

  return { ok: true, enlace: `${env.appUrl}/activar/${token}` };
}

export type InvitacionValida = { id: string; userId: string; email: string; nombre: string; clinica: string };

/** Valida un token de activación de miembro del equipo. */
export async function validarInvitacionMiembro(token: string): Promise<Resultado<{ invitacion: InvitacionValida }>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "El enlace no es válido." };
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("invitaciones")
    .select("id, vence_en, usada_en, membresias!inner(user_id, email, nombre, activo), clinicas!inner(nombre)")
    .eq("token_hash", hashToken(token))
    .not("membresia_id", "is", null)
    .maybeSingle();

  if (!data) return { ok: false, error: "El enlace no es válido o ya fue reemplazado por uno nuevo." };
  const m = data.membresias as unknown as { user_id: string; email: string; nombre: string; activo: boolean };
  const c = data.clinicas as unknown as { nombre: string };
  if (data.usada_en) return { ok: false, error: "Este enlace ya fue usado. Si necesitás uno nuevo, pedíselo al administrador." };
  if (new Date(data.vence_en) < new Date()) return { ok: false, error: "El enlace venció. Pedile al administrador que te envíe uno nuevo." };
  if (!m.activo) return { ok: false, error: "Tu acceso está desactivado. Consultá con el administrador de la clínica." };

  return { ok: true, invitacion: { id: data.id, userId: m.user_id, email: m.email, nombre: m.nombre, clinica: c.nombre } };
}

/** Consume el enlace y fija la clave elegida por la persona. */
export async function activarMiembro(token: string, clave: string): Promise<Resultado<{ email: string }>> {
  const v = await validarInvitacionMiembro(token);
  if (!v.ok) return v;
  const admin = crearClienteAdmin(v.invitacion.userId);

  // Se marca como usada de forma atómica: si dos requests llegan a la vez, solo una gana.
  const marcada = await admin
    .from("invitaciones")
    .update({ usada_en: new Date().toISOString() })
    .eq("id", v.invitacion.id)
    .is("usada_en", null)
    .select("id");
  if (marcada.error || marcada.data.length !== 1) return { ok: false, error: "Este enlace ya fue usado." };

  const actualizado = await admin.auth.admin.updateUserById(v.invitacion.userId, { password: clave });
  if (actualizado.error) {
    await admin.from("invitaciones").update({ usada_en: null }).eq("id", v.invitacion.id);
    return { ok: false, error: "No se pudo guardar la contraseña. Probá con otra." };
  }

  // Si era una renovación de clave, se cierran las sesiones abiertas con la anterior.
  await admin.rpc("srv_cerrar_sesiones", { p_user: v.invitacion.userId });
  return { ok: true, email: v.invitacion.email };
}
