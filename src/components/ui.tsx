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
