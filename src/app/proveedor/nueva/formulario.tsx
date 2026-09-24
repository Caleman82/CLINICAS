"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CopiarEnlace } from "@/components/copiar-enlace";
import { Boton, Campo, Mensaje, Tarjeta } from "@/components/ui";
import { crearClinica, type EstadoAltaClinica } from "../acciones";

export function FormularioAltaClinica() {
  const [estado, accion, pendiente] = useActionState<EstadoAltaClinica, FormData>(crearClinica, {});

  if (estado.creada) {
    return (
      <Tarjeta className="flex max-w-2xl flex-col gap-5">
        <h2 className="font-display text-2xl font-semibold">{estado.creada.nombre} quedó creada</h2>
        {estado.creada.aviso && <Mensaje tipo="alerta">{estado.creada.aviso}</Mensaje>}
        {estado.creada.enlace && (
          <>
            <p className="leading-relaxed text-tinta-media">
              Enviale este enlace al administrador de la clínica para que cree su contraseña:
            </p>
            <CopiarEnlace enlace={estado.creada.enlace} />
          </>
        )}
        {!estado.creada.enlace && !estado.creada.aviso && (
          <Mensaje tipo="exito">El administrador ya tenía cuenta en el sistema: entra con su contraseña de siempre.</Mensaje>
        )}
        <Link href={`/proveedor/clinicas/${estado.creada.id}`} className="font-semibold text-marca hover:text-marca-oscura">
          Ir a la ficha de la clínica
        </Link>
      </Tarjeta>
    );
  }

  return (
    <form action={accion} className="flex max-w-3xl flex-col gap-6">
      {estado.error && <Mensaje tipo="error">{estado.error}</Mensaje>}
      <Tarjeta className="grid gap-5 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">Datos de la clínica</h2>
        <Campo id="nombre" name="nombre" etiqueta="Nombre" required />
        <Campo
          id="slug"
          name="slug"
          etiqueta="Identificador (slug)"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          ayuda="Minúsculas y guiones. Se usa en las direcciones. No se puede cambiar."
        />
        <Campo id="rubro" name="rubro" etiqueta="Rubro" placeholder="Ej.: Médica y estética" />
        <Campo id="telefono_contacto" name="telefono_contacto" etiqueta="Teléfono de contacto" type="tel" />
        <div className="sm:col-span-2">
          <Campo id="direccion" name="direccion" etiqueta="Dirección" />
        </div>
      </Tarjeta>

      <Tarjeta className="grid gap-5 sm:grid-cols-3">
        <h2 className="text-lg font-bold sm:col-span-3">Suscripción</h2>
        <Campo id="plan" name="plan" etiqueta="Plan" />
        <Campo id="precio_mensual" name="precio_mensual" etiqueta="Precio mensual (UYU)" inputMode="decimal" />
        <Campo id="fecha_proximo_cobro" name="fecha_proximo_cobro" etiqueta="Próximo cobro" type="date" />
      </Tarjeta>

      <Tarjeta className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="text-lg font-bold">Primer administrador</h2>
          <p className="text-sm text-tinta-suave">Recibe un enlace de un solo uso para crear su contraseña.</p>
        </div>
        <Campo id="admin_nombre" name="admin_nombre" etiqueta="Nombre y apellido" required />
        <Campo id="admin_email" name="admin_email" etiqueta="Email" type="email" required />
      </Tarjeta>

      <div>
        <Boton type="submit" variante="oscuro" disabled={pendiente}>
          {pendiente ? "Creando…" : "Dar de alta la clínica"}
        </Boton>
      </div>
    </form>
  );
}
