"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  expenseCategoriaSchema,
  type ExpenseCategoriaInput,
} from "@/lib/validation/gasto";
import { createExpenseCategoria, updateExpenseCategoria } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CategoriaGastoForm({
  categoriaId,
  defaultValues,
}: {
  categoriaId?: string;
  defaultValues: ExpenseCategoriaInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseCategoriaInput>({
    resolver: zodResolver(expenseCategoriaSchema),
    defaultValues,
  });

  const onSubmit = async (data: ExpenseCategoriaInput) => {
    setServerError(null);
    const result = categoriaId
      ? await updateExpenseCategoria(categoriaId, data)
      : await createExpenseCategoria(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/gastos/categorias");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm text-brand-ciruela">
          Nombre
        </label>
        <Input id="name" {...register("name")} />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-ciruela">
        <input type="checkbox" {...register("isActive")} />
        Activa
      </label>
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
