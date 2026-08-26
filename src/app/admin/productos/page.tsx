import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleProductoButton } from "./toggle-producto-button";
import { EliminarProductoButton } from "./eliminar-producto-button";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productos }, { data: categorias }, umbralStockBajo] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, promo_price, stock, is_active, category_id")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name"),
    obtenerUmbralStockBajo(),
  ]);

  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.name]));

  const idsProductos = (productos ?? []).map((p) => p.id);
  const { data: imagenesPrincipales } =
    idsProductos.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsProductos)
          .eq("is_primary", true)
      : { data: [] as { product_id: string; url: string }[] };
  const imagenPorProducto = new Map(
    (imagenesPrincipales ?? []).map((img) => [img.product_id, img.url]),
  );

  // Un producto solo se puede borrar si nunca se ha vendido (ni en la
  // tienda ni en el POS) -- si ya tiene ventas, la unica opcion es
  // desactivarlo, para no perder el historial de esas ventas.
  const [{ data: ventasOrderItems }, { data: ventasPosItems }] =
    idsProductos.length > 0
      ? await Promise.all([
          supabase.from("order_items").select("product_id").in("product_id", idsProductos),
          supabase.from("pos_sale_items").select("product_id").in("product_id", idsProductos),
        ])
      : [{ data: [] as { product_id: string | null }[] }, { data: [] as { product_id: string | null }[] }];
  const productosConVentas = new Set(
    [...(ventasOrderItems ?? []), ...(ventasPosItems ?? [])]
      .map((v) => v.product_id)
      .filter((id): id is string => Boolean(id)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Productos</h1>
        <Link href="/admin/productos/nuevo">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Nuevo producto
          </Button>
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {(productos ?? []).map((producto) => {
          const imagenUrl = imagenPorProducto.get(producto.id) ?? null;
          const stockBadge =
            producto.stock === 0
              ? { variant: "danger" as const, label: "Agotado" }
              : producto.stock <= umbralStockBajo
                ? { variant: "warning" as const, label: `${producto.stock} unidades` }
                : { variant: "neutral" as const, label: `${producto.stock} unidades` };
          const descuento = calcularDescuento(producto.price, producto.promo_price);
          const precioMostrado = precioEfectivo(producto.price, producto.promo_price);

          return (
            <div
              key={producto.id}
              className="flex gap-3 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm sm:flex-col sm:gap-0 sm:overflow-hidden sm:p-0"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro sm:aspect-square sm:h-auto sm:w-full sm:rounded-none">
                {imagenUrl ? (
                  <Image
                    src={imagenUrl}
                    alt={producto.name}
                    fill
                    className="object-contain"
                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 80px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-[10px] text-brand-ciruela/50 sm:text-sm">
                    Sin imagen
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 sm:p-4">
                <p className="font-heading text-brand-ciruela">{producto.name}</p>
                <p className="text-xs text-brand-ciruela/60">
                  {producto.sku}
                  {producto.category_id
                    ? ` · ${categoriaPorId.get(producto.category_id) ?? "—"}`
                    : ""}
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="font-heading text-lg text-brand-rosa">
                    {formatPrice(precioMostrado)}
                  </p>
                  {descuento !== null && (
                    <p className="text-xs text-brand-ciruela/50 line-through">
                      {formatPrice(producto.price)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
                  <Badge variant={producto.is_active ? "success" : "neutral"}>
                    {producto.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                  {descuento !== null && (
                    <Badge variant="warning">Promoción -{descuento}%</Badge>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-3 pt-2 text-sm">
                  <Link
                    href={`/admin/productos/${producto.id}/editar`}
                    className="text-brand-rosa hover:underline"
                  >
                    Editar
                  </Link>
                  <ToggleProductoButton id={producto.id} isActive={producto.is_active} />
                  {!productosConVentas.has(producto.id) && (
                    <EliminarProductoButton id={producto.id} nombre={producto.name} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
