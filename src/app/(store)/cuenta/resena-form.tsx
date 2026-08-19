"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  resenaClienteSchema,
  type ResenaClienteInput,
} from "@/lib/validation/resena";
import { guardarResena } from "./actions";
import { EstrellasInput } from "@/components/store/estrellas-input";
import { Button } from "@/components/ui/button";

export function ResenaClienteForm({
  defaultValues,
  yaTieneResena,
}: {
  defaultValues: ResenaClienteInput;
  yaTieneResena: boolean;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResenaClienteInput>({
    resolver: zodResolver(resenaClienteSchema),
    defaultValues,
  });

  const onSubmit = async (data: ResenaClienteInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await guardarResena(data);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <span className="text-sm text-brand-ciruela">Calificación</span>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <EstrellasInput value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.rating && (
          <p className="text-sm text-red-600">{errors.rating.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="body" className="text-sm text-brand-ciruela">
          Tu reseña
        </label>
        <textarea
          id="body"
          rows={4}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("body")}
        />
        {errors.body && (
          <p className="text-sm text-red-600">{errors.body.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">
          Reseña guardada. Se publicará cuando el equipo la revise.
        </p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting
          ? "Guardando..."
          : yaTieneResena
            ? "Actualizar reseña"
            : "Publicar reseña"}
      </Button>
    </form>
  );
}
