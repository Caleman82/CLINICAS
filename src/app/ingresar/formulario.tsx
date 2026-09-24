"use client";

import { useActionState } from "react";
import { Boton, Campo, Mensaje } from "@/components/ui";
import { ingresar, type EstadoIngreso } from "./acciones";

export function FormularioIngreso({ aviso }: { aviso?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoIngreso, FormData>(ingresar, {});
  return (
    <form action={accion} className="flex flex-col gap-6">
      {aviso && !estado.error && <Mensaje tipo="exito">{aviso}</Mensaje>}
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      <Campo id="email" name="email" type="email" etiqueta="Email" autoComplete="username" required defaultValue={estado.email} />
      <Campo id="clave" name="clave" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
      <Boton type="submit" disabled={pendiente} className="h-[52px] text-base">
        {pendiente ? "Ingresando…" : "Ingresar al panel"}
      </Boton>
    </form>
  );
}
