import { colorLegible } from "@/lib/marca";
import { marcaClinica } from "@/lib/sesion-paciente";

// Manifest de la PWA con la marca de cada clínica.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const marca = await marcaClinica(slug);
  if (!marca) return new Response("No encontrado", { status: 404 });
  const color = colorLegible(marca.color_primario);
  const manifest = {
    name: marca.nombre,
    short_name: marca.nombre.slice(0, 12),
    description: `Tus turnos en ${marca.nombre}`,
    lang: "es-UY",
    start_url: `/p/${slug}`,
    scope: `/p/${slug}/`,
    id: `/p/${slug}`,
    display: "standalone",
    background_color: "#F6F4EF",
    theme_color: color,
    icons: [
      { src: `/p/${slug}/icono?s=192`, sizes: "192x192", type: "image/png" },
      { src: `/p/${slug}/icono?s=512`, sizes: "512x512", type: "image/png" },
      { src: `/p/${slug}/icono?s=512&m=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
