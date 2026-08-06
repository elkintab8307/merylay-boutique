"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { categoriaSchema, type CategoriaInput } from "@/lib/validation/categoria";
import { slugify } from "@/lib/slug";
import { createCategoria, updateCategoria } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoriaOption = { id: string; name: string };

export function CategoriaForm({
  categoriaId,
  defaultValues,
  categoriasDisponibles,
}: {
  categoriaId?: string;
  defaultValues: CategoriaInput;
  categoriasDisponibles: CategoriaOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues,
  });

  const onSubmit = async (data: CategoriaInput) => {
    setServerError(null);
    const result = categoriaId
      ? await updateCategoria(categoriaId, data)
      : await createCategoria(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/categorias");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className="text-sm text-brand-ciruela">
          Nombre
        </label>
        <Input
          id="name"
          {...register("name", {
            onChange: (e) => {
              if (!categoriaId) {
                setValue("slug", slugify(e.target.value));
              }
            },
          })}
        />
        {errors.name && (
          <p className="text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="slug" className="text-sm text-brand-ciruela">
          Slug
        </label>
        <Input id="slug" {...register("slug")} />
        {errors.slug && (
          <p className="text-sm text-red-600">{errors.slug.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="description" className="text-sm text-brand-ciruela">
          Descripción
        </label>
        <Input id="description" {...register("description")} />
      </div>
      <div>
        <label htmlFor="parentId" className="text-sm text-brand-ciruela">
          Categoría padre
        </label>
        <select
          id="parentId"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("parentId", { setValueAs: (v) => (v === "" ? null : v) })}
        >
          <option value="">Sin categoría padre</option>
          {categoriasDisponibles
            .filter((c) => c.id !== categoriaId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="sortOrder" className="text-sm text-brand-ciruela">
          Orden
        </label>
        <Input
          id="sortOrder"
          type="number"
          {...register("sortOrder", { valueAsNumber: true })}
        />
        {errors.sortOrder && (
          <p className="text-sm text-red-600">{errors.sortOrder.message}</p>
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
