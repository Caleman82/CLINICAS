import Link from "next/link";
import { EstadoSuscripcion, Tarjeta } from "@/components/ui";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EstadoSuscripcion as Estado } from "@/lib/sesion";

type FilaClinica = {
  id: string;
  nombre: string;
  slug: string;
  rubro: string | null;
  plan: string | null;
  precio_mensual: number | null;
  estado_suscripcion: Estado;
  fecha_proximo_cobro: string | null;
};

export default async function PanelProveedor() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("clinicas")
    .select("id, nombre, slug, rubro, plan, precio_mensual, estado_suscripcion, fecha_proximo_cobro")
    .order("nombre");
  const clinicas = (data ?? []) as FilaClinica[];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[38px] font-semibold">Clínicas y suscripciones</h1>
        <Link
          href="/proveedor/nueva"
          className="inline-flex h-[46px] items-center rounded-[10px] bg-tinta px-5 text-[15px] font-semibold text-white hover:bg-tinta-media"
        >
          Dar de alta una clínica
        </Link>
      </div>

      <Tarjeta className="overflow-x-auto px-6 py-2">
        {clinicas.length === 0 ? (
          <p className="py-10 text-center text-tinta-suave">Todavía no hay clínicas. Dá de alta la primera.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-borde text-[13px] font-bold tracking-wider text-tinta-suave uppercase">
                <th className="py-4 pr-3">Clínica</th>
                <th className="py-4 pr-3">Rubro</th>
                <th className="py-4 pr-3">Plan</th>
                <th className="py-4 pr-3">Estado</th>
                <th className="py-4 pr-3">Próximo cobro</th>
                <th className="py-4" />
              </tr>
            </thead>
            <tbody>
              {clinicas.map((c) => (
                <tr key={c.id} className="border-b border-[#eceae3] last:border-0">
                  <td className="py-4 pr-3">
                    <div className="font-bold">{c.nombre}</div>
                    <div className="text-[13px] text-tinta-suave">/{c.slug}</div>
                  </td>
                  <td className="py-4 pr-3">{c.rubro ?? "—"}</td>
                  <td className="py-4 pr-3">
                    {c.plan ?? "—"}
                    {c.precio_mensual !== null && <span className="text-tinta-suave"> · {formatoPesos(c.precio_mensual)}/mes</span>}
                  </td>
                  <td className="py-4 pr-3">
                    <EstadoSuscripcion estado={c.estado_suscripcion} />
                  </td>
                  <td className="py-4 pr-3">{formatoFecha(c.fecha_proximo_cobro)}</td>
                  <td className="py-4 text-right">
                    <Link href={`/proveedor/clinicas/${c.id}`} className="text-sm font-semibold text-marca hover:text-marca-oscura">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Tarjeta>
    </div>
  );
}
