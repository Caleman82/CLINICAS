"use client";

import { useActionState } from "react";
import { Boton, Campo, Mensaje } from "@/components/ui";
import { activar, type EstadoActivacion } from "./acciones";

export function FormularioActivacion({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoActivacion, FormData>(activar.bind(null, token), {});
  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      <Campo
        id="clave"
        name="clave"
        type="password"
        etiqueta="Nueva contraseña"
        autoComplete="new-password"
        minLength={8}
        required
        ayuda="Mínimo 8 caracteres, con al menos un número."
      />
      <Campo id="confirmacion" name="confirmacion" type="password" etiqueta="Repetí la contraseña" autoComplete="new-password" required />
      <Boton type="submit" disabled={pendiente} className="h-[52px] text-base">
        {pendiente ? "Guardando…" : "Crear mi contraseña"}
      </Boton>
    </form>
  );
}
