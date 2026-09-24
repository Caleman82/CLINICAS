import type { Client } from "pg";

// Identificadores fijos para que los tests sean legibles.
const u = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const F = {
  superadmin: { id: u(1) },
  clinicaA: u(100),
  clinicaB: u(200),
  // Clínica A
  adminA: { id: u(101) },
  recepA: { id: u(102) },
  profA: { id: u(103) },
  profA2: { id: u(104) },
  pacienteA1: { id: u(105) },
  pacienteA2: { id: u(106) },
  // Clínica B
  adminB: { id: u(201) },
  recepB: { id: u(202) },
  profB: { id: u(203) },
  pacienteB1: { id: u(205) },
  // Registros
  fichaProfA: u(1103),
  fichaProfA2: u(1104),
  fichaProfB: u(2103),
  fichaPacA1: u(1105),
  fichaPacA2: u(1106),
  fichaPacB1: u(2105),
  servicioA: u(1300),
  servicioB: u(2300),
  recursoA: u(1400),
  recursoB: u(2400),
  paqueteA1: u(1500),
  paqueteB1: u(2500),
  campoTodosA: u(1600),
  campoProfA: u(1601),
};

/** Carga dos clínicas completas, cada una con su equipo, pacientes, turnos y notas. */
export async function cargarFixture(db: Client) {
  await db.query("begin");
  const usuarios = [
    F.superadmin, F.adminA, F.recepA, F.profA, F.profA2, F.pacienteA1, F.pacienteA2,
    F.adminB, F.recepB, F.profB, F.pacienteB1,
  ];
  for (const x of usuarios) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [x.id, `${x.id}@test.local`]);
    await db.query("insert into auth.sessions (user_id) values ($1)", [x.id]);
  }
  await db.query("insert into public.plataforma_admins (user_id) values ($1)", [F.superadmin.id]);

  for (const [clinica, slug] of [[F.clinicaA, "clinica-a"], [F.clinicaB, "clinica-b"]]) {
    await db.query("insert into public.clinicas (id, nombre, slug, rubro) values ($1, $2, $3, 'Médica')", [
      clinica, `Clínica ${slug}`, slug,
    ]);
  }

  const miembro = (clinica: string, user: string, rol: string) =>
    db.query("insert into public.membresias (clinica_id, user_id, rol, nombre, email) values ($1, $2, $3, 'Persona Test', $4)", [
      clinica, user, rol, `${user}@test.local`,
    ]);
  await miembro(F.clinicaA, F.adminA.id, "admin_clinica");
  await miembro(F.clinicaA, F.recepA.id, "recepcion");
  await miembro(F.clinicaA, F.profA.id, "profesional");
  await miembro(F.clinicaA, F.profA2.id, "profesional");
  await miembro(F.clinicaB, F.adminB.id, "admin_clinica");
  await miembro(F.clinicaB, F.recepB.id, "recepcion");
  await miembro(F.clinicaB, F.profB.id, "profesional");

  const profesional = (id: string, clinica: string, user: string, nombre: string) =>
    db.query("insert into public.profesionales (id, clinica_id, user_id, nombre_visible) values ($1, $2, $3, $4)", [
      id, clinica, user, nombre,
    ]);
  await profesional(F.fichaProfA, F.clinicaA, F.profA.id, "Dra. A");
  await profesional(F.fichaProfA2, F.clinicaA, F.profA2.id, "Dr. A2");
  await profesional(F.fichaProfB, F.clinicaB, F.profB.id, "Dra. B");

  await db.query("insert into public.servicios (id, clinica_id, nombre, duracion_min, indicaciones_previas) values ($1, $2, 'Consulta', 30, 'Venir 10 min antes')", [F.servicioA, F.clinicaA]);
  await db.query("insert into public.servicios (id, clinica_id, nombre, duracion_min) values ($1, $2, 'Consulta', 30)", [F.servicioB, F.clinicaB]);
  await db.query("insert into public.recursos (id, clinica_id, nombre, tipo) values ($1, $2, 'Sillón 1', 'sillon')", [F.recursoA, F.clinicaA]);
  await db.query("insert into public.recursos (id, clinica_id, nombre, tipo) values ($1, $2, 'Cabina', 'cabina')", [F.recursoB, F.clinicaB]);

  const paciente = (id: string, clinica: string, user: string, cedula: string, referencia: string) =>
    db.query(
      `insert into public.pacientes (id, clinica_id, user_id, nombre, apellido, cedula, consentimiento_registrado,
         consentimiento_fecha, estado_acceso, profesional_referencia_id)
       values ($1, $2, $3, 'Paciente', 'Test', $4, true, now(), 'activo', $5)`,
      [id, clinica, user, cedula, referencia],
    );
  await paciente(F.fichaPacA1, F.clinicaA, F.pacienteA1.id, "11111111", F.fichaProfA);
  await paciente(F.fichaPacA2, F.clinicaA, F.pacienteA2.id, "22222222", F.fichaProfA2);
  await paciente(F.fichaPacB1, F.clinicaB, F.pacienteB1.id, "33333333", F.fichaProfB);

  await db.query("insert into public.paquetes (id, clinica_id, paciente_id, servicio_id, sesiones_totales) values ($1, $2, $3, $4, 5)", [F.paqueteA1, F.clinicaA, F.fichaPacA1, F.servicioA]);
  await db.query("insert into public.paquetes (id, clinica_id, paciente_id, servicio_id, sesiones_totales) values ($1, $2, $3, $4, 5)", [F.paqueteB1, F.clinicaB, F.fichaPacB1, F.servicioB]);

  const turno = (clinica: string, paciente: string, prof: string, servicio: string, recurso: string | null, inicio: string) =>
    db.query(
      `insert into public.turnos (clinica_id, paciente_id, profesional_id, servicio_id, recurso_id, inicio, fin, notas_internas)
       values ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz + interval '30 minutes', 'nota interna')`,
      [clinica, paciente, prof, servicio, recurso, inicio],
    );
  await turno(F.clinicaA, F.fichaPacA1, F.fichaProfA, F.servicioA, F.recursoA, "2026-10-01T10:00:00-03:00");
  await turno(F.clinicaA, F.fichaPacA2, F.fichaProfA2, F.servicioA, null, "2026-10-01T10:00:00-03:00");
  await turno(F.clinicaB, F.fichaPacB1, F.fichaProfB, F.servicioB, F.recursoB, "2026-10-01T10:00:00-03:00");

  const nota = (clinica: string, paciente: string, prof: string) =>
    db.query("insert into public.notas_clinicas (clinica_id, paciente_id, profesional_id, texto) values ($1, $2, $3, 'Nota clínica confidencial')", [clinica, paciente, prof]);
  await nota(F.clinicaA, F.fichaPacA1, F.fichaProfA);
  await nota(F.clinicaA, F.fichaPacA2, F.fichaProfA2);
  await nota(F.clinicaB, F.fichaPacB1, F.fichaProfB);

  await db.query("insert into public.campos_personalizados (id, clinica_id, nombre, tipo, visible_para) values ($1, $2, 'Obra social', 'texto', 'todos')", [F.campoTodosA, F.clinicaA]);
  await db.query("insert into public.campos_personalizados (id, clinica_id, nombre, tipo, visible_para) values ($1, $2, 'Alergias', 'texto', 'profesionales')", [F.campoProfA, F.clinicaA]);
  await db.query("insert into public.valores_campos (clinica_id, paciente_id, campo_id, valor) values ($1, $2, $3, 'CASMU'), ($1, $2, $4, 'Penicilina')", [F.clinicaA, F.fichaPacA1, F.campoTodosA, F.campoProfA]);

  for (const clinica of [F.clinicaA, F.clinicaB]) {
    await db.query("insert into public.avisos (clinica_id, titulo, texto) values ($1, 'Aviso', 'Cerramos el feriado')", [clinica]);
    await db.query("insert into public.plantillas_mensaje (clinica_id, tipo, canal, texto, horas_antes) values ($1, 'recordatorio', 'whatsapp', 'Te esperamos', 24)", [clinica]);
    await db.query("insert into public.pagos_suscripcion (clinica_id, monto, periodo, fecha_pago) values ($1, 1000, '2026-09-01', '2026-09-01')", [clinica]);
    await db.query("insert into public.bloqueos_agenda (clinica_id, recurso_id, desde, hasta, motivo) select $1, id, now(), now() + interval '1 hour', 'Mantenimiento' from public.recursos where clinica_id = $1", [clinica]);
    await db.query("insert into public.horarios_profesional (clinica_id, profesional_id, dia_semana, hora_inicio, hora_fin) select $1, id, 1, '09:00', '17:00' from public.profesionales where clinica_id = $1", [clinica]);
    await db.query("insert into public.servicio_profesional (clinica_id, servicio_id, profesional_id) select $1, s.id, p.id from public.servicios s, public.profesionales p where s.clinica_id = $1 and p.clinica_id = $1", [clinica]);
    await db.query("insert into public.mensajes (clinica_id, paciente_id, canal, estado) select $1, id, 'whatsapp', 'enviado' from public.pacientes where clinica_id = $1", [clinica]);
    await db.query("insert into public.invitaciones (clinica_id, paciente_id, token_hash, vence_en) select $1, id, encode(sha256(id::text::bytea), 'hex'), now() + interval '72 hours' from public.pacientes where clinica_id = $1", [clinica]);
  }
  await db.query("commit");
}
