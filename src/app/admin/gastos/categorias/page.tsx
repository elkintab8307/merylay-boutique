import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleCategoriaGastoButton } from "./toggle-categoria-gasto-button";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function CategoriasGastoPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("expense_categories")
    .select("id, name, is_active")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Categorías de gasto
        </h1>
        <Link href="/admin/gastos/categorias/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva categoría
          </Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(categorias ?? []).map((categoria) => (
            <TableRow key={categoria.id}>
              <TableCell>{categoria.name}</TableCell>
              <TableCell>
                <Badge variant={categoria.is_active ? "success" : "neutral"}>
                  {categoria.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/gastos/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaGastoButton id={categoria.id} isActive={categoria.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
