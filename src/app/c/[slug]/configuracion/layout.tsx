import Link from "next/link";
import { Mensaje, Titulo } from "@/components/ui";
import { exigirClinica, MENSAJE_SOLO_LECTURA, puedeEscribir } from "@/lib/sesion";

export default async function LayoutConfiguracion({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const pestañas = [
    { href: `/c/${slug}/configuracion/profesionales`, texto: "Profesionales y horarios" },
    { href: `/c/${slug}/configuracion/servicios`, texto: "Servicios" },
    { href: `/c/${slug}/configuracion/recursos`, texto: "Recursos" },
    { href: `/c/${slug}/configuracion/turnos`, texto: "Cancelaciones" },
  ];
  return (
    <>
      <Titulo>Configuración</Titulo>
      <nav className="flex flex-wrap gap-2 border-b border-borde pb-3">
        {pestañas.map((p) => (
          <Link key={p.href} href={p.href} className="rounded-lg px-3 py-2 text-[15px] font-semibold text-marca hover:bg-marca-clara">
            {p.texto}
          </Link>
        ))}
      </nav>
      {!puedeEscribir(clinica) && <Mensaje tipo="alerta">{MENSAJE_SOLO_LECTURA}</Mensaje>}
      {children}
    </>
  );
}
