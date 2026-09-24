import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Boton({
  variante = "primario",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: "primario" | "secundario" | "oscuro" | "peligro" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca",
        variante === "primario" && "bg-marca text-white hover:bg-marca-oscura",
        variante === "oscuro" && "bg-tinta text-white hover:bg-tinta-media",
        variante === "secundario" && "border border-borde-campo bg-superficie text-tinta hover:bg-fondo",
        variante === "peligro" && "border border-borde-campo bg-superficie text-alerta hover:bg-alerta-clara",
        className,
      )}
    />
  );
}

export function Campo({
  etiqueta,
  ayuda,
  id,
  ...props
}: ComponentProps<"input"> & { etiqueta: string; ayuda?: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      <input
        id={id}
        {...props}
        className="h-12 rounded-[10px] border border-borde-campo bg-superficie px-3.5 text-base text-tinta focus:border-marca focus:outline-2 focus:outline-marca/30"
      />
      {ayuda && <p className="text-[13px] text-tinta-suave">{ayuda}</p>}
    </div>
  );
}

export function Selector({
  etiqueta,
  id,
  children,
  ...props
}: ComponentProps<"select"> & { etiqueta: string; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      <select
        id={id}
        {...props}
        className="h-12 rounded-[10px] border border-borde-campo bg-superficie px-3 text-base text-tinta focus:border-marca focus:outline-2 focus:outline-marca/30"
      >
        {children}
      </select>
    </div>
  );
}

export function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-[14px] border border-borde bg-superficie p-6", className)}>{children}</section>;
}

export function Mensaje({ tipo = "info", children }: { tipo?: "info" | "error" | "exito" | "alerta"; children: ReactNode }) {
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={cx(
        "rounded-xl px-4 py-3 text-[15px] leading-relaxed",
        tipo === "info" && "bg-fondo text-tinta-media",
        tipo === "error" && "bg-error-claro text-error",
        tipo === "exito" && "bg-marca-clara text-marca-oscura",
        tipo === "alerta" && "bg-alerta-clara text-alerta",
      )}
    >
      {children}
    </div>
  );
}

const estilosEstado = {
  activa: { etiqueta: "Al día", clase: "bg-marca-clara text-marca-oscura" },
  gracia: { etiqueta: "En gracia", clase: "bg-alerta-clara text-alerta" },
  solo_lectura: { etiqueta: "Solo lectura", clase: "bg-alerta-clara text-alerta" },
  suspendida: { etiqueta: "Suspendida", clase: "bg-neutro-claro text-neutro" },
} as const;

export function EstadoSuscripcion({ estado }: { estado: keyof typeof estilosEstado }) {
  const e = estilosEstado[estado];
  return <span className={cx("rounded-full px-2.5 py-1 text-[13px] font-bold", e.clase)}>{e.etiqueta}</span>;
}

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "marca" | "alerta" }) {
  return (
    <span
      className={cx(
        "rounded-full px-2.5 py-1 text-[13px] font-bold",
        tono === "neutro" && "bg-neutro-claro text-neutro",
        tono === "marca" && "bg-marca-clara text-marca-oscura",
        tono === "alerta" && "bg-alerta-clara text-alerta",
      )}
    >
      {children}
    </span>
  );
}

export function AreaTexto({ etiqueta, id, ayuda, ...props }: ComponentProps<"textarea"> & { etiqueta: string; id: string; ayuda?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={3}
        {...props}
        className="rounded-[10px] border border-borde-campo bg-superficie px-3.5 py-2.5 text-base text-tinta focus:border-marca focus:outline-2 focus:outline-marca/30"
      />
      {ayuda && <p className="text-[13px] text-tinta-suave">{ayuda}</p>}
    </div>
  );
}

export function Casilla({ etiqueta, id, ...props }: ComponentProps<"input"> & { etiqueta: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-[15px] leading-snug">
      <input id={id} type="checkbox" {...props} className="mt-0.5 size-5 shrink-0 accent-marca" />
      <span>{etiqueta}</span>
    </label>
  );
}

export function Titulo({ children, detalle, acciones }: { children: ReactNode; detalle?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {detalle && <div className="text-sm font-semibold text-tinta-suave first-letter:uppercase">{detalle}</div>}
        <h1 className="font-display text-[30px] leading-tight font-semibold sm:text-[34px]">{children}</h1>
      </div>
      {acciones && <div className="flex flex-wrap gap-3">{acciones}</div>}
    </div>
  );
}

export function EnlaceBoton({
  href,
  children,
  variante = "primario",
}: {
  href: string;
  children: ReactNode;
  variante?: "primario" | "secundario" | "oscuro";
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-11 items-center justify-center rounded-[10px] px-5 text-[15px] font-semibold transition-colors",
        variante === "primario" && "bg-marca text-white hover:bg-marca-oscura",
        variante === "oscuro" && "bg-tinta text-white hover:bg-tinta-media",
        variante === "secundario" && "border border-borde-campo bg-superficie text-tinta hover:bg-fondo",
      )}
    >
      {children}
    </Link>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[15px] text-tinta-suave">{children}</p>;
}
