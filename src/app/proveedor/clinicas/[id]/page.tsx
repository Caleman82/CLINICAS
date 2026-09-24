import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoSuscripcion, Insignia, Tarjeta } from "@/components/ui";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AgregarAdmin, NuevoEnlace } from "./admins";

export default async function FichaClinica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: clinica }, { data: admins }] = await Promise.all([
    supabase.from("clinicas").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("membresias")
      .select("id, nombre, email, activo")
      .eq("clinica_id", id)
      .eq("rol", "admin_clinica")
      .order("nombre"),
  ]);
  if (!clinica) notFound();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link href="/proveedor" className="text-sm font-semibold text-marca">
        ← Clínicas
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-[34px] font-semibold">{clinica.nombre}</h1>
        <EstadoSuscripcion estado={clinica.estado_suscripcion} />
      </div>

      <Tarjeta className="grid gap-4 text-[15px] sm:grid-cols-3">
        <Dato titulo="Identificador" valor={`/${clinica.slug}`} />
        <Dato titulo="Rubro" valor={clinica.rubro ?? "—"} />
        <Dato titulo="Plan" valor={clinica.plan ?? "—"} />
        <Dato titulo="Precio mensual" valor={formatoPesos(clinica.precio_mensual)} />
        <Dato titulo="Próximo cobro" valor={formatoFecha(clinica.fecha_proximo_cobro)} />
        <Dato titulo="Gracia / suspensión" valor={`${clinica.dias_gracia} / ${clinica.dias_hasta_suspension} días`} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-5">
        <h2 className="text-lg font-bold">Administradores de la clínica</h2>
        {(admins ?? []).length === 0 && <p className="text-tinta-suave">Todavía no tiene administradores.</p>}
        <ul className="flex flex-col divide-y divide-borde">
          {(admins ?? []).map((a) => (
            <li key={a.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">{a.nombre}</span>
                <span className="text-sm text-tinta-suave">{a.email}</span>
                {!a.activo && <Insignia>Desactivado</Insignia>}
              </div>
              {a.activo && <NuevoEnlace clinicaId={clinica.id} membresiaId={a.id} />}
            </li>
          ))}
        </ul>
        <div className="border-t border-borde pt-5">
          <AgregarAdmin clinicaId={clinica.id} />
        </div>
      </Tarjeta>
      <p className="text-sm text-tinta-suave">
        Registro de pagos y suspensión manual: fase 5. El proveedor no tiene acceso a los datos de pacientes.
      </p>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-tinta-suave">{titulo}</div>
      <div className="font-medium">{valor}</div>
    </div>
  );
}
