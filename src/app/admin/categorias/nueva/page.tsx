import { createClient } from "@/lib/supabase/server";
import { CategoriaForm } from "../categoria-form";

export default async function NuevaCategoriaPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Nueva categoría
      </h1>
      <CategoriaForm
        defaultValues={{
          name: "",
          slug: "",
          description: "",
          parentId: null,
          sortOrder: 0,
          isActive: true,
          isFeatured: false,
        }}
        categoriasDisponibles={categorias ?? []}
      />
    </div>
  );
}
