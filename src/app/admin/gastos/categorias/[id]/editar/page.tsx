import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CategoriaGastoForm } from "../../categoria-gasto-form";

export default async function EditarCategoriaGastoPage({
  params,
}: PageProps<"/admin/gastos/categorias/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: categoria } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (!categoria) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Editar categoría de gasto
      </h1>
      <CategoriaGastoForm
        categoriaId={categoria.id}
        defaultValues={{ name: categoria.name, isActive: categoria.is_active }}
      />
    </div>
  );
}
