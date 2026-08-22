import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export default async function ClientesPage({
  searchParams,
}: PageProps<"/pos/clientes">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().replace(/[%,()]/g, "") : "";

  const supabase = await createClient();
  const base = supabase
    .from("pos_customers")
    .select("id, nombre, telefono, profile_id")
    .order("nombre");

  const { data: clientes } = query
    ? await base.or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%`)
    : await base.limit(50);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Clientes</h1>
      <form className="mb-4 flex gap-2" action="/pos/clientes">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o teléfono"
          className="w-full rounded-md border border-brand-rosa-claro px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
        >
          Buscar
        </button>
      </form>
      {(clientes ?? []).length === 0 ? (
        <p className="text-brand-ciruela/70">No hay clientes para mostrar.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Teléfono</TableHeaderCell>
              <TableHeaderCell>Cuenta vinculada</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(clientes ?? []).map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell>
                  <Link href={`/pos/clientes/${cliente.id}`} className="text-brand-rosa hover:underline">
                    {cliente.nombre}
                  </Link>
                </TableCell>
                <TableCell>{cliente.telefono}</TableCell>
                <TableCell>{cliente.profile_id ? "Sí" : "No"}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
