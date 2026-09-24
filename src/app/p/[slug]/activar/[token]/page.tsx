import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mensaje, Tarjeta } from "@/components/ui";
import { formatoCedula } from "@/lib/cedula";
import { validarInvitacionPaciente } from "@/lib/invitaciones-paciente";
import { marcaClinica } from "@/lib/sesion-paciente";
import { ContactoClinica, MarcaEncabezado } from "../../encabezado";
import { FormularioActivacionPaciente } from "./formulario";

export const metadata: Metadata = { title: "Crear contraseña", referrer: "no-referrer" };

export default async function ActivarPaciente({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const marca = await marcaClinica(slug);
  if (!marca) notFound();
  const v = await validarInvitacionPaciente(slug, token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
      <MarcaEncabezado marca={marca} grande />
      <Tarjeta className="flex flex-col gap-6 p-6 sm:p-8">
        {v.ok ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-[28px] font-semibold">Hola, {v.invitacion.nombre.split(" ")[0]}</h1>
              <p className="leading-relaxed text-tinta-media">
                {v.invitacion.userId
                  ? "Creá tu nueva contraseña para la app."
                  : `Creá tu contraseña para ver y confirmar tus turnos en ${marca.nombre}.`}{" "}
                Tu usuario es tu cédula: <strong>{formatoCedula(v.invitacion.cedula)}</strong>. Nadie más va a conocer tu
                contraseña, ni siquiera la clínica.
              </p>
            </div>
            <FormularioActivacionPaciente slug={slug} token={token} />
          </>
        ) : (
          <>
            <h1 className="font-display text-[28px] font-semibold">No pudimos abrir el enlace</h1>
            <Mensaje tipo="alerta">{v.error}</Mensaje>
            <ContactoClinica marca={marca} />
          </>
        )}
      </Tarjeta>
    </main>
  );
}
