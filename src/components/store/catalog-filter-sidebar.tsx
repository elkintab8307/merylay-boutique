import type { SortKey } from "@/lib/store/sort";

export function CatalogFilterSidebar({
  minPrice,
  maxPrice,
  tallasSeleccionadas,
  coloresSeleccionadas,
  tallas,
  colores,
  sortKey,
  q,
}: {
  minPrice: number | undefined;
  maxPrice: number | undefined;
  tallasSeleccionadas: string[];
  coloresSeleccionadas: string[];
  tallas: string[];
  colores: string[];
  sortKey: SortKey;
  q?: string;
}) {
  return (
    <aside className="w-full shrink-0 md:w-56">
      <form method="get" className="flex flex-col gap-6">
        {q !== undefined && <input type="hidden" name="q" value={q} />}
        <div>
          <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Precio</h2>
          <div className="flex gap-2">
            <input
              type="number"
              name="minPrice"
              placeholder="Mín"
              defaultValue={minPrice}
              className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
            />
            <input
              type="number"
              name="maxPrice"
              placeholder="Máx"
              defaultValue={maxPrice}
              className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
            />
          </div>
        </div>

        {tallas.length > 0 && (
          <div>
            <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Talla</h2>
            <div className="flex flex-wrap gap-2">
              {tallas.map((talla) => (
                <label
                  key={talla}
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="checkbox"
                    name="talla"
                    value={talla}
                    defaultChecked={tallasSeleccionadas.includes(talla)}
                    className="sr-only"
                  />
                  {talla}
                </label>
              ))}
            </div>
          </div>
        )}

        {colores.length > 0 && (
          <div>
            <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Color</h2>
            <div className="flex flex-wrap gap-2">
              {colores.map((color) => (
                <label
                  key={color}
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="checkbox"
                    name="color"
                    value={color}
                    defaultChecked={coloresSeleccionadas.includes(color)}
                    className="sr-only"
                  />
                  {color}
                </label>
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Ordenar por</h2>
          <select
            name="sort"
            defaultValue={sortKey}
            className="w-full rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
          >
            <option value="destacados">Destacados</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
            <option value="recientes">Más reciente</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
        >
          Aplicar filtros
        </button>
      </form>
    </aside>
  );
}
