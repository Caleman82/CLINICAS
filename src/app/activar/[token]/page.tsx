import type { Metadata } from "next";
import { Mensaje, Tarjeta } from "@/components/ui";
import { validarInvitacionMiembro } from "@/lib/invitaciones";
import { FormularioActivacion } from "./formulario";

export const metadata: Metadata = { title: "Crear contraseña", referrer: "no-referrer" };

export default async function PaginaActivar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await validarInvitacionMiembro(token);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Tarjeta className="flex w-full max-w-[480px] flex-col gap-6 p-8 sm:p-10">
        {v.ok ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-tinta-suave">{v.invitacion.clinica}</p>
              <h1 className="font-display text-3xl font-semibold">Hola, {v.invitacion.nombre.split(" ")[0]}</h1>
              <p className="text-base leading-relaxed text-tinta-media">
                Creá tu contraseña para ingresar al panel. Tu usuario es <strong>{v.invitacion.email}</strong>. Nadie
                más la va a conocer.
              </p>
            </div>
            <FormularioActivacion token={token} />
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold">No pudimos abrir el enlace</h1>
            <Mensaje tipo="alerta">{v.error}</Mensaje>
          </>
        )}
      </Tarjeta>
    </main>
  );
}
