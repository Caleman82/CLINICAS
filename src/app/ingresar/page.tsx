import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { destinoInicial, obtenerContexto } from "@/lib/sesion";
import { FormularioIngreso } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

export default async function PaginaIngreso({ searchParams }: { searchParams: Promise<{ activada?: string }> }) {
  const ctx = await obtenerContexto();
  if (ctx && (ctx.superadmin || ctx.clinicas.length > 0)) redirect(destinoInicial(ctx));
  const { activada } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex flex-col justify-between gap-10 bg-tinta px-6 py-10 text-fondo sm:px-12 lg:w-[44%] lg:p-[72px]">
        <div className="font-display text-2xl font-semibold tracking-wide">Gestión de clínicas</div>
        <div className="flex flex-col gap-5">
          <h1 className="font-display text-4xl leading-[1.08] font-medium lg:text-[52px]">
            Tu agenda, tus pacientes y tus recordatorios, en un solo lugar.
          </h1>
          <p className="max-w-[420px] text-lg leading-normal text-[#c9d2cf]">
            Acceso exclusivo para el personal autorizado de la clínica.
          </p>
        </div>
        <div className="text-[13px] text-[#9faeaa]">Con tecnología de Caleman Creativa</div>
      </aside>
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[420px] flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[34px] font-semibold">Ingresar</h2>
            <p className="text-base text-tinta-suave">Usá el email y la contraseña de tu cuenta.</p>
          </div>
          <FormularioIngreso aviso={activada ? "Tu contraseña quedó creada. Ya podés ingresar." : undefined} />
          <p className="text-sm leading-normal text-tinta-suave">
            ¿Olvidaste tu clave? Pedile al administrador de la clínica que te envíe un enlace para crear una nueva. No
            hay registro libre.
          </p>
        </div>
      </section>
    </main>
  );
}
