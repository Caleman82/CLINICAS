import "server-only";
import { enviarEmail, escaparHtml } from "@/lib/email";
import { env } from "@/lib/env";
import { emailTecnicoPaciente } from "@/lib/paciente";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { generarToken, hashToken, VIGENCIA_INVITACION_HORAS } from "@/lib/tokens";

type Resultado<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Genera la invitación del paciente (o un enlace para renovar su clave si ya activó).
 * Un solo uso, vence en 72 h, se guarda solo el hash; invalida los enlaces anteriores.
 * Si el paciente tiene email y hay proveedor configurado, se le envía.
 * Quien llama debe haber verificado que el usuario actual es admin o recepción de la clínica.
 */
export async function invitarPaciente(params: {
  clinicaId: string;
  slug: string;
  clinicaNombre: string;
  pacienteId: string;
  creadoPor: string;
}): Promise<Resultado<{ enlace: string; nombre: string; celular: string | null; email: string | null; emailEnviado: boolean; renovacion: boolean }>> {
  const admin = crearClienteAdmin(params.creadoPor);
  const { data: p } = await admin
    .from("pacientes")
    .select("id, nombre, email, celular, estado_acceso, user_id")
    .eq("id", params.pacienteId)
    .eq("clinica_id", params.clinicaId)
    .maybeSingle();
  if (!p) return { ok: false, error: "No se encontró el paciente." };
  if (p.estado_acceso === "desactivado") return { ok: false, error: "El acceso del paciente está desactivado. Reactivalo primero." };

  await admin.from("invitaciones").delete().eq("paciente_id", p.id).is("usada_en", null);
  const { token, hash } = generarToken();
  const canal = p.email ? "email" : "enlace";
  const ins = await admin.from("invitaciones").insert({
    clinica_id: params.clinicaId,
    paciente_id: p.id,
    token_hash: hash,
    vence_en: new Date(Date.now() + VIGENCIA_INVITACION_HORAS * 3600_000).toISOString(),
    canal,
    creado_por: params.creadoPor,
  });
  if (ins.error) return { ok: false, error: "No se pudo generar la invitación." };

  const enlace = `${env.appUrl}/p/${params.slug}/activar/${token}`;
  const renovacion = !!p.user_id;
  let emailEnviado = false;
  if (p.email) {
    const clinica = escaparHtml(params.clinicaNombre);
    const r = await enviarEmail({
      para: p.email,
      asunto: renovacion ? `${params.clinicaNombre}: creá tu nueva contraseña` : `${params.clinicaNombre} te invita a su app`,
      texto: `Hola ${p.nombre}:\n\n${
        renovacion
          ? `Recibimos un pedido para crear una nueva contraseña para la app de ${params.clinicaNombre}.`
          : `${params.clinicaNombre} te invita a usar su app para ver y confirmar tus turnos.`
      }\n\nCreá tu contraseña en este enlace (vence en ${VIGENCIA_INVITACION_HORAS} horas y sirve una sola vez):\n${enlace}\n\nTu usuario es tu cédula. Si no esperabas este mensaje, ignoralo.`,
      html: `<p>Hola ${escaparHtml(p.nombre)}:</p><p>${
        renovacion
          ? `Recibimos un pedido para crear una nueva contraseña para la app de ${clinica}.`
          : `${clinica} te invita a usar su app para ver y confirmar tus turnos.`
      }</p><p><a href="${enlace}">Crear mi contraseña</a></p><p>El enlace vence en ${VIGENCIA_INVITACION_HORAS} horas y sirve una sola vez. Tu usuario es tu cédula.</p><p>Si no esperabas este mensaje, ignoralo.</p>`,
    });
    emailEnviado = r.enviado;
    if (r.motivo !== "sin_configurar") {
      await admin.from("mensajes").insert({
        clinica_id: params.clinicaId,
        paciente_id: p.id,
        canal: "email",
        estado: r.enviado ? "enviado" : "fallido",
        enviado_en: r.enviado ? new Date().toISOString() : null,
      });
    }
  }
  return { ok: true, enlace, nombre: p.nombre, celular: p.celular, email: p.email, emailEnviado, renovacion };
}

export type InvitacionPaciente = {
  id: string;
  pacienteId: string;
  nombre: string;
  cedula: string;
  userId: string | null;
  clinicaId: string;
};

export async function validarInvitacionPaciente(slug: string, token: string): Promise<Resultado<{ invitacion: InvitacionPaciente }>> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, error: "El enlace no es válido." };
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("invitaciones")
    .select("id, vence_en, usada_en, clinica_id, pacientes!inner(id, nombre, cedula, user_id, estado_acceso), clinicas!inner(slug)")
    .eq("token_hash", hashToken(token))
    .not("paciente_id", "is", null)
    .maybeSingle();
  if (!data) return { ok: false, error: "El enlace no es válido o ya fue reemplazado por uno nuevo. Pedile a la clínica que te envíe otro." };
  const p = data.pacientes as unknown as { id: string; nombre: string; cedula: string; user_id: string | null; estado_acceso: string };
  const c = data.clinicas as unknown as { slug: string };
  if (c.slug !== slug) return { ok: false, error: "El enlace no es válido." };
  if (data.usada_en) return { ok: false, error: "Este enlace ya fue usado. Si necesitás uno nuevo, pedíselo a la clínica." };
  if (new Date(data.vence_en) < new Date()) return { ok: false, error: "El enlace venció. Pedile a la clínica que te envíe uno nuevo." };
  if (p.estado_acceso === "desactivado") return { ok: false, error: "Tu acceso está desactivado. Comunicate con la clínica." };
  return {
    ok: true,
    invitacion: { id: data.id, pacienteId: p.id, nombre: p.nombre, cedula: p.cedula, userId: p.user_id, clinicaId: data.clinica_id },
  };
}

/** Consume el enlace: crea la identidad del paciente (o renueva su clave) y habilita su acceso. */
export async function activarPaciente(slug: string, token: string, clave: string): Promise<Resultado<{ cedula: string }>> {
  const v = await validarInvitacionPaciente(slug, token);
  if (!v.ok) return v;
  const inv = v.invitacion;
  const admin = crearClienteAdmin();

  const marcada = await admin.from("invitaciones").update({ usada_en: new Date().toISOString() }).eq("id", inv.id).is("usada_en", null).select("id");
  if (marcada.error || marcada.data.length !== 1) return { ok: false, error: "Este enlace ya fue usado." };
  const liberar = () => admin.from("invitaciones").update({ usada_en: null }).eq("id", inv.id);

  if (inv.userId) {
    // Renovación de clave.
    const r = await admin.auth.admin.updateUserById(inv.userId, { password: clave });
    if (r.error) {
      await liberar();
      return { ok: false, error: "No se pudo guardar la contraseña. Probá con otra." };
    }
    await admin.rpc("srv_cerrar_sesiones", { p_user: inv.userId });
    return { ok: true, cedula: inv.cedula };
  }

  // Primera activación: identidad técnica exclusiva de esta clínica.
  const email = emailTecnicoPaciente(slug, inv.cedula);
  let userId: string | null = null;
  const creado = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true });
  if (creado.data.user) {
    userId = creado.data.user.id;
  } else {
    // Puede existir de un intento anterior incompleto: se reutiliza.
    const existente = await admin.rpc("srv_usuario_por_email", { p_email: email });
    userId = (existente.data as string | null) ?? null;
    if (userId) {
      const r = await admin.auth.admin.updateUserById(userId, { password: clave });
      if (r.error) userId = null;
    }
  }
  if (!userId) {
    await liberar();
    return { ok: false, error: "No se pudo crear tu cuenta. Probá de nuevo o comunicate con la clínica." };
  }

  const vinculo = await admin
    .from("pacientes")
    .update({ user_id: userId, estado_acceso: "activo" })
    .eq("id", inv.pacienteId)
    .is("user_id", null)
    .select("id");
  if (vinculo.error || vinculo.data.length !== 1) {
    await liberar();
    return { ok: false, error: "No se pudo activar tu cuenta. Comunicate con la clínica." };
  }
  return { ok: true, cedula: inv.cedula };
}
