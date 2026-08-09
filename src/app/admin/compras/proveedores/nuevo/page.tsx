import { ProveedorForm } from "../proveedor-form";

export default function NuevoProveedorPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nuevo proveedor</h1>
      <ProveedorForm defaultValues={{ name: "", phone: "", isActive: true }} />
    </div>
  );
}
