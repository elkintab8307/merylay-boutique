import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleProveedorButton } from "./toggle-proveedor-button";

export default async function ProveedoresPage() {
  const supabase = await createClient();
  const { data: proveedores, error } = await supabase
    .from("suppliers")
    .select("id, name, phone, is_active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Proveedores</h1>
        <Link href="/admin/compras/proveedores/nuevo">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nuevo proveedor
          </Button>
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-600">No se pudieron cargar los proveedores.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Nombre</th>
                <th className="py-2">Teléfono</th>
                <th className="py-2">Activo</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(proveedores ?? []).map((proveedor) => (
                <tr key={proveedor.id} className="border-b border-brand-rosa-claro/50">
                  <td className="py-2">{proveedor.name}</td>
                  <td className="py-2">{proveedor.phone ?? "-"}</td>
                  <td className="py-2">{proveedor.is_active ? "Sí" : "No"}</td>
                  <td className="flex gap-3 py-2">
                    <Link
                      href={`/admin/compras/proveedores/${proveedor.id}/editar`}
                      className="text-brand-rosa hover:underline"
                    >
                      Editar
                    </Link>
                    <ToggleProveedorButton
                      id={proveedor.id}
                      isActive={proveedor.is_active}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
