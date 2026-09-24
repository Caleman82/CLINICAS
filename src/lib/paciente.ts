/**
 * Identidad técnica del paciente en Supabase Auth: una por clínica y cédula.
 * El paciente nunca la ve (ingresa con su cédula). El dominio .invalid está
 * reservado y no puede recibir correo.
 */
export function emailTecnicoPaciente(slug: string, cedula: string): string {
  return `p-${cedula}@${slug}.pacientes.invalid`;
}

export function esEmailTecnicoPaciente(email: string): boolean {
  return email.endsWith(".pacientes.invalid");
}
