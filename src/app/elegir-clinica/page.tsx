import Link from "next/link";
import { EstadoSuscripcion, Tarjeta } from "@/components/ui";
import { exigirSesion } from "@/lib/sesion";
import { nombresRol } from "@/lib/validacion";

export default async function ElegirClinica() {
  const ctx = await exigirSesion();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Elegí la clínica</h1>
      <div className="flex flex-col gap-3">
        {ctx.clinicas.map((c) => (
          <Link key={c.clinica_id} href={`/c/${c.slug}`}>
            <Tarjeta className="flex items-center justify-between gap-4 p-5 hover:border-marca">
              <div>
                <div className="text-lg font-bold">{c.nombre}</div>
                <div className="text-sm text-tinta-suave">{nombresRol[c.rol]}</div>
              </div>
              <EstadoSuscripcion estado={c.estado_suscripcion} />
            </Tarjeta>
          </Link>
        ))}
      </div>
    </main>
  );
}
