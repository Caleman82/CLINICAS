import Link from "next/link";
import { salir } from "@/app/acciones-sesion";
import { Mensaje, Tarjeta } from "@/components/ui";
import { exigirClinica } from "@/lib/sesion";
import { nombresRol } from "@/lib/validacion";

export default async function LayoutClinica({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx, clinica } = await exigirClinica(slug);

  if (clinica.estado_suscripcion === "suspendida") {
    return <AccesoPausado esAdmin={clinica.rol === "admin_clinica"} />;
  }

  const esAdmin = clinica.rol === "admin_clinica";
  const enlaces = [
    { href: `/c/${slug}`, texto: "Agenda" },
    { href: `/c/${slug}/pacientes`, texto: "Pacientes", pronto: true },
    ...(esAdmin
      ? [
          { href: `/c/${slug}/equipo`, texto: "Equipo" },
          { href: `/c/${slug}/configuracion`, texto: "Configuración", pronto: true },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <nav className="flex shrink-0 flex-col gap-6 bg-tinta px-5 py-6 text-fondo md:w-60">
        <div>
          <div className="font-display text-xl font-semibold tracking-wide">{clinica.nombre}</div>
          <div className="text-[13px] text-[#9faeaa]">{nombresRol[clinica.rol]}</div>
        </div>
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {enlaces.map((e) => (
            <li key={e.href}>
              {e.pronto ? (
                <span className="block rounded-lg px-3 py-2 text-[15px] text-[#9faeaa]" title="Disponible en próximas fases">
                  {e.texto}
                </span>
              ) : (
                <Link href={e.href} className="block rounded-lg px-3 py-2 text-[15px] font-medium hover:bg-white/10">
                  {e.texto}
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-2 text-[13px] text-[#c9d2cf]">
          <span className="truncate">{ctx.email}</span>
          {ctx.clinicas.length > 1 && (
            <Link href="/elegir-clinica" className="font-semibold text-white hover:underline">
              Cambiar de clínica
            </Link>
          )}
          <form action={salir}>
            <button className="font-semibold text-white hover:underline">Salir</button>
          </form>
        </div>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-8 sm:px-10">
        {clinica.estado_suscripcion === "gracia" && (
          <Mensaje tipo="alerta">
            La suscripción tiene un pago pendiente. Todo sigue funcionando; regularizalo para evitar restricciones.
          </Mensaje>
        )}
        {clinica.estado_suscripcion === "solo_lectura" && (
          <Mensaje tipo="alerta">
            Modo solo lectura por pago pendiente: podés consultar la agenda y las fichas, pero no crear ni editar, y no
            se envían recordatorios.
          </Mensaje>
        )}
        {children}
      </main>
    </div>
  );
}

function AccesoPausado({ esAdmin }: { esAdmin: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Tarjeta className="flex w-full max-w-[560px] flex-col gap-5 p-8 sm:p-11">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <h1 className="font-display text-[32px] leading-tight font-semibold">El acceso de la clínica está pausado</h1>
        <p className="leading-relaxed text-tinta-media">
          La suscripción mensual tiene un pago pendiente. Todos los datos de pacientes y turnos están guardados y
          seguros. Apenas se registre el pago, el acceso vuelve tal cual estaba.
        </p>
        <Mensaje>Mientras tanto, los pacientes ven en la app un aviso para comunicarse directamente con la clínica.</Mensaje>
        {esAdmin && (
          <p className="text-sm text-tinta-suave">La descarga de datos de la clínica estará disponible acá (fase 5).</p>
        )}
        <form action={salir}>
          <button className="h-[50px] rounded-[10px] border border-borde-campo px-5 font-medium hover:bg-fondo">Salir</button>
        </form>
      </Tarjeta>
    </main>
  );
}
