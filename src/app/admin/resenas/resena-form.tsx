"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { resenaSchema, type ResenaInput } from "@/lib/validation/resena";
import { createResena, updateResena } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResenaForm({
  resenaId,
  defaultValues,
  imagenActual = null,
}: {
  resenaId?: string;
  defaultValues: ResenaInput;
  imagenActual?: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResenaInput>({
    resolver: zodResolver(resenaSchema),
    defaultValues,
  });

  const onSubmit = async (data: ResenaInput) => {
    setServerError(null);
    try {
      const result = resenaId
        ? await updateResena(resenaId, data, imageFile, imagenActual)
        : await createResena(data, imageFile);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      router.push("/admin/resenas");
      router.refresh();
    } catch {
      setServerError(
        "No se pudo guardar la reseña. Verifica que la imagen no supere los 8MB.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="customerName" className="text-sm text-brand-ciruela">
          Nombre de la clienta
        </label>
        <Input id="customerName" {...register("customerName")} />
        {errors.customerName && (
          <p className="text-sm text-red-600">{errors.customerName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="body" className="text-sm text-brand-ciruela">
          Texto de la reseña
        </label>
        <textarea
          id="body"
          rows={4}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("body")}
        />
        {errors.body && <p className="text-sm text-red-600">{errors.body.message}</p>}
      </div>
      <div>
        <label htmlFor="rating" className="text-sm text-brand-ciruela">
          Calificación
        </label>
        <select
          id="rating"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("rating", { valueAsNumber: true })}
        >
          {[5, 4, 3, 2, 1].map((valor) => (
            <option key={valor} value={valor}>
              {valor} {valor === 1 ? "estrella" : "estrellas"}
            </option>
          ))}
        </select>
        {errors.rating && <p className="text-sm text-red-600">{errors.rating.message}</p>}
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
      <div className="flex flex-col gap-2">
        <label className="text-sm text-brand-ciruela">Foto (opcional)</label>
        {imagenActual && (
          <Image
            src={imagenActual}
            alt=""
            width={200}
            height={112}
            className="h-28 w-full max-w-xs rounded-md object-cover"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
        />
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
