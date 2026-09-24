"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { EstadoForm } from "@/lib/errores";
import { Boton, Mensaje } from "./ui";

/**
 * Formulario conectado a una Server Action que devuelve { error?, ok? }.
 * `limpiar`: vacía los campos después de guardar bien (para formularios de alta en listas).
 */
export function Formulario({
  accion,
  children,
  textoBoton,
  textoPendiente = "Guardando…",
  variante = "primario",
  className = "flex flex-col gap-5",
  limpiar = false,
  deshabilitado = false,
  confirmar,
}: {
  accion: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  children?: ReactNode;
  textoBoton: string;
  textoPendiente?: string;
  variante?: "primario" | "secundario" | "oscuro" | "peligro";
  className?: string;
  limpiar?: boolean;
  deshabilitado?: boolean;
  confirmar?: string;
}) {
  const [estado, ejecutar, pendiente] = useActionState<EstadoForm, FormData>(accion, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (limpiar && estado.ok) ref.current?.reset();
  }, [estado, limpiar]);

  return (
    <form
      ref={ref}
      className={className}
      // Se envía a mano (no con action=) para que React no vacíe los campos si hay un error.
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmar && !confirm(confirmar)) return;
        const datos = new FormData(e.currentTarget);
        startTransition(() => ejecutar(datos));
      }}
    >
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      {estado.ok && <Mensaje tipo="exito">{estado.ok}</Mensaje>}
      {children}
      <div>
        <Boton type="submit" variante={variante} disabled={pendiente || deshabilitado}>
          {pendiente ? textoPendiente : textoBoton}
        </Boton>
      </div>
    </form>
  );
}

/** Botón que ejecuta una acción sin campos (cambiar estado, borrar, etc.). */
export function BotonAccion({
  accion,
  texto,
  variante = "secundario",
  confirmar,
  deshabilitado = false,
}: {
  accion: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>;
  texto: string;
  variante?: "primario" | "secundario" | "oscuro" | "peligro";
  confirmar?: string;
  deshabilitado?: boolean;
}) {
  const [estado, ejecutar, pendiente] = useActionState<EstadoForm, FormData>(accion, {});
  return (
    <form
      action={ejecutar}
      className="inline-flex flex-col gap-2"
      onSubmit={(e) => {
        if (confirmar && !confirm(confirmar)) e.preventDefault();
      }}
    >
      <Boton type="submit" variante={variante} disabled={pendiente || deshabilitado} className="h-10 px-4 text-sm">
        {texto}
      </Boton>
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
    </form>
  );
}
