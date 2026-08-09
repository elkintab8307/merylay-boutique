import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProveedorForm } from "../../proveedor-form";

export default async function EditarProveedorPage({
  params,
}: PageProps<"/admin/compras/proveedores/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proveedor } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .single();

  if (!proveedor) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar proveedor</h1>
      <ProveedorForm
        proveedorId={proveedor.id}
        defaultValues={{
          name: proveedor.name,
          phone: proveedor.phone ?? "",
          isActive: proveedor.is_active,
        }}
      />
    </div>
  );
}
