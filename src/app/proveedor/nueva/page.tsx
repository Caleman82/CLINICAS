import Link from "next/link";
import { FormularioAltaClinica } from "./formulario";

export default function NuevaClinica() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/proveedor" className="text-sm font-semibold text-marca">
        ← Clínicas
      </Link>
      <h1 className="font-display text-[34px] font-semibold">Alta de clínica</h1>
      <FormularioAltaClinica />
    </div>
  );
}
