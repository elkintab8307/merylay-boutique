import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { sanitizarQueryBusqueda } from "@/lib/search/sanitize";

export default async function ClientesPage({
  searchParams,
}: PageProps<"/pos/clientes">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? sanitizarQueryBusqueda(q) : "";

  const supabase = await createClient();
  const { data: clientes } = await supabase.rpc("listar_clientes_pos", {
    p_query: query || undefined,
    p_limit: 50,
  });

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
              <TableHeaderCell>Origen</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(clientes ?? []).map((cliente) => (
              <TableRow key={`${cliente.origen}-${cliente.id}`}>
                <TableCell>
                  <Link
                    href={
                      cliente.origen === "pos"
                        ? `/pos/clientes/${cliente.id}`
                        : `/pos/clientes/portal/${cliente.profile_id}`
                    }
                    className="text-brand-rosa hover:underline"
                  >
                    {cliente.nombre}
                  </Link>
                </TableCell>
                <TableCell>{cliente.telefono}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      cliente.origen === "pos"
                        ? "bg-brand-rosa-claro/40 text-brand-ciruela"
                        : "bg-brand-oro/20 text-brand-oro"
                    }`}
                  >
                    {cliente.origen === "pos" ? "POS" : "Portal"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
