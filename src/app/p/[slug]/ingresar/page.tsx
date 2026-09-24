import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Mensaje, Tarjeta } from "@/components/ui";
import { obtenerPaciente } from "@/lib/sesion-paciente";
import { ContactoClinica, MarcaEncabezado } from "../encabezado";
import { FormularioIngresoPaciente } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

export default async function IngresoPaciente({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ activada?: string }>;
}) {
  const { slug } = await params;
  const { activada } = await searchParams;
  const r = await obtenerPaciente(slug);
  if (!r) notFound();
  if (r.paciente && r.marca.estado_suscripcion !== "suspendida") redirect(`/p/${slug}`);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
      <MarcaEncabezado marca={r.marca} grande />
      {r.marca.estado_suscripcion === "suspendida" ? (
        <Tarjeta className="flex flex-col gap-4">
          <h1 className="font-display text-2xl font-semibold">La app no está disponible en este momento</h1>
          <p className="leading-relaxed text-tinta-media">Para consultar o cambiar tus turnos, comunicate directamente con la clínica.</p>
          <ContactoClinica marca={r.marca} />
        </Tarjeta>
      ) : (
        <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[28px] font-semibold">Ingresar</h1>
            <p className="text-tinta-suave">Tu usuario es tu cédula.</p>
          </div>
          <FormularioIngresoPaciente slug={slug} aviso={activada ? "Tu contraseña quedó creada. Ya podés ingresar." : undefined} />
          <Mensaje>¿Olvidaste tu contraseña? Pedile a la clínica que te envíe un enlace para crear una nueva.</Mensaje>
          <ContactoClinica marca={r.marca} />
        </Tarjeta>
      )}
    </main>
  );
}
