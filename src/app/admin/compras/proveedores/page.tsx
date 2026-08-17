import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleProveedorButton } from "./toggle-proveedor-button";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Teléfono</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Acciones</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(proveedores ?? []).map((proveedor) => (
              <TableRow key={proveedor.id}>
                <TableCell>{proveedor.name}</TableCell>
                <TableCell>{proveedor.phone ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={proveedor.is_active ? "success" : "neutral"}>
                    {proveedor.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/compras/proveedores/${proveedor.id}/editar`}
                      className="text-brand-rosa hover:underline"
                    >
                      Editar
                    </Link>
                    <ToggleProveedorButton id={proveedor.id} isActive={proveedor.is_active} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
