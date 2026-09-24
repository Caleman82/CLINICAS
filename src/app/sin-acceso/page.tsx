import { Boton, Tarjeta } from "@/components/ui";
import { salir } from "@/app/acciones-sesion";

export default function SinAcceso() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Tarjeta className="flex max-w-[480px] flex-col gap-5 p-10">
        <h1 className="font-display text-3xl font-semibold">Sin acceso activo</h1>
        <p className="leading-relaxed text-tinta-media">
          Tu usuario no tiene acceso a ninguna clínica en este momento. Consultá con el administrador de tu clínica.
        </p>
        <form action={salir}>
          <Boton variante="secundario">Salir</Boton>
        </form>
      </Tarjeta>
    </main>
  );
}
