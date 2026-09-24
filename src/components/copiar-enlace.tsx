"use client";

import { useState } from "react";

/** Muestra un enlace de activación para copiar y enviar a mano (hasta tener email/WhatsApp). */
export function CopiarEnlace({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          readOnly
          value={enlace}
          aria-label="Enlace de activación"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-borde-campo bg-fondo px-3 font-mono text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(enlace);
            setCopiado(true);
          }}
          className="h-11 shrink-0 rounded-[10px] bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscura"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="text-[13px] text-tinta-suave">
        Es de un solo uso y vence en 72 horas. Envialo por un canal privado: quien lo abra crea la contraseña.
      </p>
    </div>
  );
}
