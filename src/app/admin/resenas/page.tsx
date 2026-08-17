import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ToggleResenaButton } from "./toggle-resena-button";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function ResenasPage() {
  const supabase = await createClient();
  const { data: resenas } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, sort_order, is_active")
    .order("sort_order", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Reseñas</h1>
        <Link href="/admin/resenas/nueva">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nueva reseña
          </Button>
        </Link>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Clienta</TableHeaderCell>
            <TableHeaderCell>Calificación</TableHeaderCell>
            <TableHeaderCell>Orden</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
            <TableHeaderCell>Acciones</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {resenas?.map((resena) => (
            <TableRow key={resena.id}>
              <TableCell>{resena.customer_name}</TableCell>
              <TableCell>{resena.rating} / 5</TableCell>
              <TableCell>{resena.sort_order}</TableCell>
              <TableCell>
                <Badge variant={resena.is_active ? "success" : "neutral"}>
                  {resena.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/resenas/${resena.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleResenaButton id={resena.id} isActive={resena.is_active} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
