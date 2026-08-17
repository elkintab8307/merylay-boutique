import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { EliminarGastoButton } from "./eliminar-gasto-button";

export default async function GastosPage({
  searchParams,
}: PageProps<"/admin/gastos">) {
  const { desde, hasta, categoria } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("expenses")
    .select("id, description, amount, expense_date, category_id")
    .order("expense_date", { ascending: false });

  if (typeof desde === "string" && desde) {
    query = query.gte("expense_date", desde);
  }
  if (typeof hasta === "string" && hasta) {
    query = query.lte("expense_date", hasta);
  }
  if (typeof categoria === "string" && categoria) {
    query = query.eq("category_id", categoria);
  }

  const { data: gastos, error } = await query;

  const { data: categorias } = await supabase
    .from("expense_categories")
    .select("id, name")
    .order("name");

  const categoriaNombreById = new Map((categorias ?? []).map((c) => [c.id, c.name]));
  const total = (gastos ?? []).reduce((sum, g) => sum + g.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Gastos</h1>
        <div className="flex gap-3">
          <Link href="/admin/gastos/categorias">
            <Button className="bg-white text-brand-rosa border border-brand-rosa hover:bg-brand-rosa-claro/30">
              Categorías
            </Button>
          </Link>
          <Link href="/admin/gastos/nuevo">
            <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
              Nuevo gasto
            </Button>
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="desde" className="text-sm text-brand-ciruela">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={typeof desde === "string" ? desde : ""}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="text-sm text-brand-ciruela">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={typeof hasta === "string" ? hasta : ""}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="categoria" className="text-sm text-brand-ciruela">
            Categoría
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={typeof categoria === "string" ? categoria : ""}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          Filtrar
        </Button>
      </form>

      {error ? (
        <p className="text-sm text-red-600">No se pudieron cargar los gastos.</p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Total del periodo filtrado</p>
            <p className="font-heading text-2xl text-brand-rosa">{formatPrice(total)}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Categoría</TableHeaderCell>
                <TableHeaderCell>Descripción</TableHeaderCell>
                <TableHeaderCell>Monto</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {(gastos ?? []).map((gasto) => (
                <TableRow key={gasto.id}>
                  <TableCell>{gasto.expense_date}</TableCell>
                  <TableCell>{categoriaNombreById.get(gasto.category_id) ?? "-"}</TableCell>
                  <TableCell>{gasto.description}</TableCell>
                  <TableCell>{formatPrice(gasto.amount)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/gastos/${gasto.id}/editar`}
                        className="text-brand-rosa hover:underline"
                      >
                        Editar
                      </Link>
                      <EliminarGastoButton id={gasto.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
