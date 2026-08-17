import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleCategoriaButton } from "./toggle-categoria-button";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function CategoriasPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, is_active, parent_id")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Categorías
        </h1>
        <Link href="/admin/categorias/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva categoría
          </Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nombre</TableHeaderCell>
            <TableHeaderCell>Slug</TableHeaderCell>
            <TableHeaderCell>Orden</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {categorias?.map((categoria) => (
            <TableRow key={categoria.id}>
              <TableCell>{categoria.name}</TableCell>
              <TableCell className="text-brand-ciruela/70">{categoria.slug}</TableCell>
              <TableCell>{categoria.sort_order}</TableCell>
              <TableCell>
                <Badge variant={categoria.is_active ? "success" : "neutral"}>
                  {categoria.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/categorias/${categoria.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleCategoriaButton id={categoria.id} isActive={categoria.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
