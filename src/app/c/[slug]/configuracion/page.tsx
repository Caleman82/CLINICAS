import { redirect } from "next/navigation";

export default async function Configuracion({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/c/${slug}/configuracion/profesionales`);
}
