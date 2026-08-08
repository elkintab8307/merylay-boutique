import { createClient } from "@/lib/supabase/server";
import { GastoForm } from "../gasto-form";

export default async function NuevoGastoPage() {
  const supabase = await createClient();
  const { data: categorias } = await supabase
    .from("expense_categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nuevo gasto</h1>
      <GastoForm
        defaultValues={{
          categoryId: "",
          description: "",
          amount: 0,
          expenseDate: new Date().toISOString().slice(0, 10),
        }}
        categorias={categorias ?? []}
      />
    </div>
  );
}
