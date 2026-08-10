import { createClient } from "@/lib/supabase/server";
import { ProductoForm } from "../producto-form";

export default async function NuevoProductoPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nuevo producto</h1>
      <ProductoForm
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          categoryId: null,
          price: 0,
          compareAtPrice: null,
          costPrice: null,
          stock: 0,
          isActive: true,
          isFeatured: false,
          variantes: [
            { talla: "", color: "", priceOverride: null, stock: 0 },
          ],
        }}
        categoriasDisponibles={categorias ?? []}
      />
    </div>
  );
}
