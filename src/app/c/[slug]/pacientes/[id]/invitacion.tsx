"use client";

import { useActionState } from "react";
import { CopiarEnlace } from "@/components/copiar-enlace";
import { Boton, Mensaje } from "@/components/ui";
import { invitarPacienteApp, type EstadoInvitacion } from "../acciones";

/** Enviar (o reenviar) la invitación a la app, o un enlace para renovar la clave. */
export function InvitarPaciente({ slug, pacienteId, texto, deshabilitado }: { slug: string; pacienteId: string; texto: string; deshabilitado: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoInvitacion>(invitarPacienteApp.bind(null, slug, pacienteId), {});
  return (
    <div className="flex flex-col gap-3">
      <form action={accion}>
        <Boton type="submit" variante="secundario" disabled={pendiente || deshabilitado} className="h-10 px-4 text-sm">
          {pendiente ? "Generando…" : texto}
        </Boton>
      </form>
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.ok && <Mensaje tipo="exito">{estado.ok}</Mensaje>}
      {estado.enlace && (
        <>
          {estado.whatsapp && (
            <a
              href={estado.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center self-start rounded-[10px] bg-[#1c7c43] px-5 text-[15px] font-semibold text-white hover:bg-[#15663a]"
            >
              Enviar por WhatsApp
            </a>
          )}
          {!estado.emailEnviado && <CopiarEnlace enlace={estado.enlace} />}
        </>
      )}
    </div>
  );
}
