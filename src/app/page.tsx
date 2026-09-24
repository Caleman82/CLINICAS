import { redirect } from "next/navigation";
import { destinoInicial, obtenerContexto } from "@/lib/sesion";

export default async function Inicio() {
  const ctx = await obtenerContexto();
  redirect(ctx ? destinoInicial(ctx) : "/ingresar");
}
