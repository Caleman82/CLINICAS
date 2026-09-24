"use client";

import { useActionState } from "react";
import { CopiarEnlace } from "@/components/copiar-enlace";
import { Boton, Campo, Mensaje } from "@/components/ui";
import { agregarAdmin, nuevoEnlaceAdmin, type EstadoAdmin } from "../../acciones";

export function AgregarAdmin({ clinicaId }: { clinicaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAdmin, FormData>(agregarAdmin.bind(null, clinicaId), {});
  return (
    <form action={accion} className="flex flex-col gap-4">
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.ok && estado.enlace && <CopiarEnlace enlace={estado.enlace} />}
      {estado.ok && !estado.enlace && <Mensaje tipo="exito">Agregado. Ya tenía cuenta: entra con su contraseña de siempre.</Mensaje>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nombre" name="nombre" etiqueta="Nombre y apellido" required />
        <Campo id="email" name="email" etiqueta="Email" type="email" required />
      </div>
      <div>
        <Boton type="submit" variante="secundario" disabled={pendiente}>
          Agregar administrador
        </Boton>
      </div>
    </form>
  );
}

export function NuevoEnlace({ clinicaId, membresiaId }: { clinicaId: string; membresiaId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAdmin>(nuevoEnlaceAdmin.bind(null, clinicaId, membresiaId), {});
  return (
    <form action={accion} className="flex flex-col gap-2">
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.enlace ? (
        <CopiarEnlace enlace={estado.enlace} />
      ) : (
        <button disabled={pendiente} className="self-start text-sm font-semibold text-marca hover:text-marca-oscura">
          Generar enlace para crear/renovar clave
        </button>
      )}
    </form>
  );
}
