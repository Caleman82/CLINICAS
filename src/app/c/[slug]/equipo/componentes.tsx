"use client";

import { useActionState, useState, useTransition } from "react";
import { CopiarEnlace } from "@/components/copiar-enlace";
import { Boton, Campo, Mensaje, Selector } from "@/components/ui";
import { cambiarActivo, generarEnlace, invitar, type EstadoEquipo } from "./acciones";

export function FormularioInvitar({ slug, deshabilitado }: { slug: string; deshabilitado: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoEquipo, FormData>(invitar.bind(null, slug), {});
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.ok && <Mensaje tipo="exito">{estado.ok}</Mensaje>}
      {estado.enlace && <CopiarEnlace enlace={estado.enlace} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="nombre" name="nombre" etiqueta="Nombre y apellido" required />
        <Campo id="email" name="email" etiqueta="Email" type="email" required />
        <Selector id="rol" name="rol" etiqueta="Rol" defaultValue="recepcion">
          <option value="recepcion">Recepción</option>
          <option value="profesional">Profesional</option>
          <option value="admin_clinica">Administración</option>
        </Selector>
      </div>
      <div>
        <Boton type="submit" disabled={pendiente || deshabilitado}>
          {pendiente ? "Agregando…" : "Agregar al equipo"}
        </Boton>
      </div>
    </form>
  );
}

export function AccionesMiembro({
  slug,
  membresiaId,
  activo,
  deshabilitado,
}: {
  slug: string;
  membresiaId: string;
  activo: boolean;
  deshabilitado: boolean;
}) {
  const [estado, setEstado] = useState<EstadoEquipo>({});
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (fn: () => Promise<EstadoEquipo>) => iniciar(async () => setEstado(await fn()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        {activo && (
          <button
            disabled={pendiente || deshabilitado}
            onClick={() => ejecutar(() => generarEnlace(slug, membresiaId))}
            className="text-marca hover:text-marca-oscura disabled:opacity-50"
          >
            Enviar enlace de clave
          </button>
        )}
        <button
          disabled={pendiente || deshabilitado}
          onClick={() => {
            if (activo && !confirm("¿Desactivar el acceso? La persona no va a poder ingresar y se cierran sus sesiones.")) return;
            ejecutar(() => cambiarActivo(slug, membresiaId, !activo));
          }}
          className={(activo ? "text-alerta" : "text-marca") + " hover:underline disabled:opacity-50"}
        >
          {activo ? "Desactivar" : "Reactivar"}
        </button>
      </div>
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.ok && !estado.enlace && <Mensaje tipo="exito">{estado.ok}</Mensaje>}
      {estado.enlace && <CopiarEnlace enlace={estado.enlace} />}
    </div>
  );
}
