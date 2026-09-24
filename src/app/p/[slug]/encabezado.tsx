import type { MarcaClinica } from "@/lib/sesion-paciente";

/** Logo (o inicial) y nombre de la clínica. */
export function MarcaEncabezado({ marca, grande = false }: { marca: MarcaClinica; grande?: boolean }) {
  const lado = grande ? 56 : 40;
  return (
    <div className="flex items-center gap-3">
      {marca.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={marca.logo_url} alt="" width={lado} height={lado} className="rounded-xl object-contain" />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-xl bg-marca font-display font-semibold text-white"
          style={{ width: lado, height: lado, fontSize: lado * 0.45 }}
          aria-hidden
        >
          {marca.nombre.trim().charAt(0).toUpperCase()}
        </div>
      )}
      <span className={`font-display font-semibold ${grande ? "text-2xl" : "text-lg"}`}>{marca.nombre}</span>
    </div>
  );
}

/** Contacto de la clínica (teléfono con enlace para llamar y dirección). */
export function ContactoClinica({ marca }: { marca: MarcaClinica }) {
  if (!marca.telefono_contacto && !marca.direccion) return null;
  return (
    <div className="flex flex-col gap-1 text-[15px]">
      {marca.telefono_contacto && (
        <a href={`tel:${marca.telefono_contacto.replace(/[^\d+]/g, "")}`} className="font-semibold text-marca underline">
          {marca.telefono_contacto}
        </a>
      )}
      {marca.direccion && <span className="text-tinta-media">{marca.direccion}</span>}
    </div>
  );
}
