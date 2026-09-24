import { Insignia, Tarjeta } from "@/components/ui";
import { formatoFechaHora } from "@/lib/formato";
import { exigirClinica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { nombresRol, type Rol } from "@/lib/validacion";
import { AccionesMiembro, FormularioInvitar } from "./componentes";

type Miembro = { id: string; user_id: string; nombre: string; email: string; rol: Rol; activo: boolean };
type Invitacion = { membresia_id: string; vence_en: string; usada_en: string | null };

export default async function Equipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const soloLectura = !["activa", "gracia"].includes(clinica.estado_suscripcion);

  const supabase = await crearClienteServidor();
  const [{ data: miembros }, { data: invitaciones }] = await Promise.all([
    supabase.from("membresias").select("id, user_id, nombre, email, rol, activo").eq("clinica_id", clinica.clinica_id).order("nombre"),
    supabase.from("invitaciones").select("membresia_id, vence_en, usada_en").eq("clinica_id", clinica.clinica_id).not("membresia_id", "is", null),
  ]);

  const pendientes = new Map<string, Invitacion>();
  const usadas = new Set<string>();
  for (const inv of (invitaciones ?? []) as Invitacion[]) {
    if (inv.usada_en) usadas.add(inv.membresia_id);
    else pendientes.set(inv.membresia_id, inv);
  }

  return (
    <>
      <h1 className="font-display text-[34px] font-semibold">Equipo</h1>

      <Tarjeta className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">Agregar a alguien</h2>
        <p className="text-sm text-tinta-suave">
          Se genera un enlace de un solo uso (vence en 72 horas) para que la persona cree su propia contraseña.
        </p>
        <FormularioInvitar slug={slug} deshabilitado={soloLectura} />
      </Tarjeta>

      <Tarjeta className="px-6 py-2">
        <ul className="divide-y divide-borde">
          {((miembros ?? []) as Miembro[]).map((m) => {
            const pendiente = pendientes.get(m.id);
            const vencida = pendiente && new Date(pendiente.vence_en) < new Date();
            return (
              <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{m.nombre}</span>
                    <Insignia tono="marca">{nombresRol[m.rol]}</Insignia>
                    {!m.activo && <Insignia>Desactivado</Insignia>}
                    {m.activo && pendiente && !usadas.has(m.id) && (
                      <Insignia tono="alerta">{vencida ? "Enlace vencido" : "Pendiente de activar"}</Insignia>
                    )}
                  </div>
                  <span className="text-sm text-tinta-suave">{m.email}</span>
                  {pendiente && !vencida && (
                    <span className="text-[13px] text-tinta-suave">Enlace vigente hasta {formatoFechaHora(pendiente.vence_en)}</span>
                  )}
                </div>
                {m.user_id === ctx.userId ? (
                  <span className="text-sm text-tinta-suave">Vos</span>
                ) : (
                  <AccionesMiembro slug={slug} membresiaId={m.id} activo={m.activo} deshabilitado={soloLectura} />
                )}
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </>
  );
}
