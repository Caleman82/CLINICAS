import Link from "next/link";
import { salir } from "@/app/acciones-sesion";
import { exigirSuperadmin } from "@/lib/sesion";

export default async function LayoutProveedor({ children }: { children: React.ReactNode }) {
  const ctx = await exigirSuperadmin();
  return (
    <div className="min-h-dvh bg-fondo-2">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-superficie px-4 py-3 sm:px-12">
        <Link href="/proveedor" className="text-sm font-semibold text-tinta-suave">
          Caleman Creativa · Administración del sistema
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-tinta-suave">{ctx.email}</span>
          <form action={salir}>
            <button className="font-semibold text-marca hover:text-marca-oscura">Salir</button>
          </form>
        </div>
      </header>
      <div className="px-4 py-8 sm:px-12 sm:py-10">{children}</div>
    </div>
  );
}
