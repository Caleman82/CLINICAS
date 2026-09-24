import Link from "next/link";
import { Tarjeta } from "@/components/ui";
import { exigirPaciente } from "@/lib/sesion-paciente";
import { ContactoClinica, MarcaEncabezado } from "../encabezado";
import { salirPaciente } from "./acciones";

export default async function LayoutAppPaciente({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await exigirPaciente(slug);

  if (s.suspendida) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
        <MarcaEncabezado marca={s.marca} grande />
        <Tarjeta className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-semibold">La app no está disponible en este momento</h1>
          <p className="leading-relaxed text-tinta-media">Para consultar o cambiar tus turnos, comunicate directamente con la clínica.</p>
          <ContactoClinica marca={s.marca} />
        </Tarjeta>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-3">
        <MarcaEncabezado marca={s.marca} />
        <form action={salirPaciente.bind(null, slug)}>
          <button className="h-10 rounded-[10px] px-3 text-sm font-semibold text-tinta-suave hover:bg-neutro-claro">Salir</button>
        </form>
      </header>
      <nav className="sticky top-0 z-10 flex gap-1 border-b border-borde bg-fondo/95 px-4 backdrop-blur" aria-label="Secciones">
        <Link href={`/p/${slug}`} className="border-b-2 border-transparent px-3 py-3 text-[15px] font-semibold hover:border-marca">
          Inicio
        </Link>
        <Link href={`/p/${slug}/turnos`} className="border-b-2 border-transparent px-3 py-3 text-[15px] font-semibold hover:border-marca">
          Mis turnos
        </Link>
      </nav>
      <main className="flex flex-1 flex-col gap-6 px-4 py-6 pb-12">{children}</main>
    </div>
  );
}
