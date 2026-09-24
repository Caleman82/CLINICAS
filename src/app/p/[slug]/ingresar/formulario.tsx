"use client";

import { useActionState } from "react";
import { Boton, Campo, Mensaje } from "@/components/ui";
import { ingresarPaciente, type EstadoIngresoPaciente } from "./acciones";

export function FormularioIngresoPaciente({ slug, aviso }: { slug: string; aviso?: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoIngresoPaciente, FormData>(ingresarPaciente.bind(null, slug), {});
  return (
    <form action={accion} className="flex flex-col gap-5">
      {aviso && !estado.error && <Mensaje tipo="exito">{aviso}</Mensaje>}
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      <Campo id="cedula" name="cedula" etiqueta="Cédula" inputMode="numeric" autoComplete="username" placeholder="1.234.567-8" required defaultValue={estado.cedula} />
      <Campo id="clave" name="clave" type="password" etiqueta="Contraseña" autoComplete="current-password" required />
      <Boton type="submit" disabled={pendiente} className="h-[52px] text-base">
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
