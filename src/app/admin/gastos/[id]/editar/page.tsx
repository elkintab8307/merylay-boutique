import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GastoForm } from "../../gasto-form";

export default async function EditarGastoPage({
  params,
}: PageProps<"/admin/gastos/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: gasto } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();

  if (!gasto) {
    notFound();
  }

  const { data: categorias } = await supabase
    .from("expense_categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Editar gasto</h1>
      <GastoForm
        gastoId={gasto.id}
        defaultValues={{
          categoryId: gasto.category_id,
          description: gasto.description,
          amount: gasto.amount,
          expenseDate: gasto.expense_date,
        }}
        categorias={categorias ?? []}
      />
    </div>
  );
}
