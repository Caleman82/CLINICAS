"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Selectores de vista, profesional y recurso: cambian la URL al instante. */
export function FiltrosAgenda({
  profesionales,
  recursos,
  mostrarProfesional,
  profActual,
}: {
  profesionales: { id: string; nombre: string }[];
  recursos: { id: string; nombre: string }[];
  mostrarProfesional: boolean;
  profActual: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const cambiar = (clave: string, valor: string) => {
    const u = new URLSearchParams(sp);
    if (valor) u.set(clave, valor);
    else u.delete(clave);
    u.delete("turno");
    router.push(`${pathname}?${u}`);
  };
  const clase = "h-10 rounded-[10px] border border-borde-campo bg-superficie px-3 text-[15px]";

  return (
    <div className="flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="f-vista">
        Vista
      </label>
      <select id="f-vista" className={clase} value={sp.get("vista") ?? "dia"} onChange={(e) => cambiar("vista", e.target.value === "dia" ? "" : e.target.value)}>
        <option value="dia">Día</option>
        <option value="semana">Semana</option>
      </select>
      {mostrarProfesional && (
        <>
          <label className="sr-only" htmlFor="f-prof">
            Profesional
          </label>
          <select id="f-prof" className={clase} value={profActual} onChange={(e) => cambiar("prof", e.target.value)}>
            {sp.get("vista") !== "semana" && <option value="">Todos los profesionales</option>}
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </>
      )}
      {recursos.length > 0 && (
        <>
          <label className="sr-only" htmlFor="f-recurso">
            Recurso
          </label>
          <select id="f-recurso" className={clase} value={sp.get("recurso") ?? ""} onChange={(e) => cambiar("recurso", e.target.value)}>
            <option value="">Todos los recursos</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
