import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CategoriaForm } from "../../categoria-form";

export default async function EditarCategoriaPage({
  params,
}: PageProps<"/admin/categorias/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: categoria } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (!categoria) {
    notFound();
  }

  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Editar categoría
      </h1>
      <CategoriaForm
        categoriaId={categoria.id}
        defaultValues={{
          name: categoria.name,
          slug: categoria.slug,
          description: categoria.description ?? "",
          parentId: categoria.parent_id,
          sortOrder: categoria.sort_order,
          isActive: categoria.is_active,
        }}
        categoriasDisponibles={categorias ?? []}
        imagenActual={categoria.image_url}
      />
    </div>
  );
}
