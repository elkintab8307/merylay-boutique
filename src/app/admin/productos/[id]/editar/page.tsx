import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductoForm } from "../../producto-form";

export default async function EditarProductoPage({
  params,
}: PageProps<"/admin/productos/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (!producto) {
    notFound();
  }

  const [{ data: categorias }, { data: variantes }, { data: imagenes }, { data: costo }] =
    await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase
        .from("product_variants")
        .select("talla, color, price_override, stock")
        .eq("product_id", id),
      supabase
        .from("product_images")
        .select("id, url, is_primary")
        .eq("product_id", id)
        .order("sort_order"),
      supabase
        .from("product_costs")
        .select("cost_price")
        .eq("product_id", id)
        .maybeSingle(),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar producto</h1>
      <ProductoForm
        productoId={producto.id}
        skuActual={producto.sku}
        defaultValues={{
          name: producto.name,
          slug: producto.slug,
          description: producto.description ?? "",
          categoryId: producto.category_id,
          price: producto.price,
          compareAtPrice: producto.compare_at_price,
          costPrice: costo?.cost_price ?? null,
          stock: producto.stock,
          isActive: producto.is_active,
          isFeatured: producto.is_featured,
          variantes: (variantes ?? []).map((v) => ({
            talla: v.talla ?? "",
            color: v.color ?? "",
            priceOverride: v.price_override,
            stock: v.stock,
          })),
        }}
        categoriasDisponibles={categorias ?? []}
        imagenesExistentes={imagenes ?? []}
      />
    </div>
  );
}
