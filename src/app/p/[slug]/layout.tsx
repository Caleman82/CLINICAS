import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { colorLegible, variablesMarca } from "@/lib/marca";
import { marcaClinica } from "@/lib/sesion-paciente";
import { RegistrarServiceWorker } from "./registrar-sw";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const marca = await marcaClinica(slug);
  if (!marca) return {};
  return {
    title: { default: marca.nombre, template: `%s · ${marca.nombre}` },
    manifest: `/p/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: marca.nombre, statusBarStyle: "default" },
    icons: { apple: `/p/${slug}/icono?s=180`, icon: `/p/${slug}/icono?s=192` },
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  const marca = await marcaClinica(slug);
  return { themeColor: colorLegible(marca?.color_primario ?? "#1F6F6B"), width: "device-width", initialScale: 1 };
}

export default async function LayoutPaciente({ children, params }: Props & { children: React.ReactNode }) {
  const { slug } = await params;
  const marca = await marcaClinica(slug);
  if (!marca) notFound();
  return (
    <div className="min-h-dvh bg-fondo" style={variablesMarca(marca.color_primario) as CSSProperties}>
      {children}
      <RegistrarServiceWorker scope={`/p/${slug}/`} />
    </div>
  );
}
