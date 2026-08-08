"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { gastoSchema, type GastoInput } from "@/lib/validation/gasto";
import { createGasto, updateGasto } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoriaOption = { id: string; name: string };

export function GastoForm({
  gastoId,
  defaultValues,
  categorias,
}: {
  gastoId?: string;
  defaultValues: GastoInput;
  categorias: CategoriaOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GastoInput>({
    resolver: zodResolver(gastoSchema),
    defaultValues,
  });

  const onSubmit = async (data: GastoInput) => {
    setServerError(null);
    const result = gastoId ? await updateGasto(gastoId, data) : await createGasto(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/gastos");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="categoryId" className="text-sm text-brand-ciruela">
          Categoría
        </label>
        <select
          id="categoryId"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("categoryId")}
        >
          <option value="">Selecciona una categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="text-sm text-red-600">{errors.categoryId.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="description" className="text-sm text-brand-ciruela">
          Descripción
        </label>
        <Input id="description" {...register("description")} />
        {errors.description && (
          <p className="text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="amount" className="text-sm text-brand-ciruela">
          Monto (COP)
        </label>
        <Input
          id="amount"
          type="number"
          step="1"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && (
          <p className="text-sm text-red-600">{errors.amount.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="expenseDate" className="text-sm text-brand-ciruela">
          Fecha
        </label>
        <Input id="expenseDate" type="date" {...register("expenseDate")} />
        {errors.expenseDate && (
          <p className="text-sm text-red-600">{errors.expenseDate.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
