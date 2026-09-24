import { ImageResponse } from "next/og";
import { colorLegible } from "@/lib/marca";
import { marcaClinica } from "@/lib/sesion-paciente";

// Ícono de la app: la inicial de la clínica sobre su color (hasta que suban logo, fase 6).
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const marca = await marcaClinica(slug);
  if (!marca) return new Response("No encontrado", { status: 404 });
  const url = new URL(req.url);
  const s = [180, 192, 512].includes(Number(url.searchParams.get("s"))) ? Number(url.searchParams.get("s")) : 192;
  const maskable = url.searchParams.get("m") === "1";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colorLegible(marca.color_primario),
          color: "white",
          fontSize: s * (maskable ? 0.42 : 0.55),
          fontWeight: 700,
          borderRadius: maskable ? 0 : s * 0.22,
        }}
      >
        {marca.nombre.trim().charAt(0).toUpperCase()}
      </div>
    ),
    { width: s, height: s, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
