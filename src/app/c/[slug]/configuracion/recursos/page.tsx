import { Formulario } from "@/components/formulario";
import { Campo, Casilla, Tarjeta, Vacio } from "@/components/ui";
import { cargarConfiguracion } from "@/lib/datos-clinica";
import { exigirClinica } from "@/lib/sesion";
import { crearRecurso, editarRecurso } from "../acciones";

export default async function Recursos({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { clinica } = await exigirClinica(slug, ["admin_clinica"]);
  const { recursos } = await cargarConfiguracion(clinica.clinica_id);
  const tipos = [...new Set(recursos.map((r) => r.tipo))];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <Tarjeta className="flex flex-col gap-2">
        <p className="text-sm text-tinta-suave">
          Sillones, cabinas, equipos o salas. Un recurso no puede estar en dos turnos a la vez. El tipo agrupa recursos
          equivalentes (ej.: todos los sillones), para que un servicio pueda pedir &ldquo;cualquier sillón&rdquo;.
        </p>
        {recursos.length === 0 && <Vacio>Todavía no hay recursos.</Vacio>}
        <ul className="divide-y divide-borde">
          {recursos.map((r) => (
            <li key={r.id} className="py-4">
              <Formulario accion={editarRecurso.bind(null, slug, r.id)} textoBoton="Guardar" variante="secundario" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Campo id={`nombre-${r.id}`} name="nombre" etiqueta="Nombre" defaultValue={r.nombre} required />
                <Campo id={`tipo-${r.id}`} name="tipo" etiqueta="Tipo" defaultValue={r.tipo} list="tipos-recurso" required />
                <div className="pb-3">
                  <Casilla id={`activo-${r.id}`} name="activo" etiqueta="Activo" defaultChecked={r.activo} />
                </div>
              </Formulario>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta className="flex flex-col gap-4 self-start">
        <h2 className="text-lg font-bold">Nuevo recurso</h2>
        <Formulario accion={crearRecurso.bind(null, slug)} textoBoton="Crear recurso" limpiar>
          <Campo id="nombre" name="nombre" etiqueta="Nombre" placeholder="Sillón 2" required />
          <Campo id="tipo" name="tipo" etiqueta="Tipo" placeholder="sillon" list="tipos-recurso" required />
        </Formulario>
      </Tarjeta>
      <datalist id="tipos-recurso">
        {tipos.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}
