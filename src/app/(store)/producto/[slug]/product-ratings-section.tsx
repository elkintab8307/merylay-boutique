"use client";

import { useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { calificacionSchema, type CalificacionInput } from "@/lib/validation/calificacion";
import { guardarCalificacion } from "./calificacion-actions";
import { EstrellasInput } from "@/components/store/estrellas-input";
import { Button } from "@/components/ui/button";

export type CalificacionItem = {
  id: string;
  rating: number;
  comment: string | null;
  autorNombre: string;
};

export function ProductRatingsSection({
  productId,
  productSlug,
  calificaciones,
  estaAutenticado,
  calificacionPropia,
}: {
  productId: string;
  productSlug: string;
  calificaciones: CalificacionItem[];
  estaAutenticado: boolean;
  calificacionPropia: CalificacionInput | null;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CalificacionInput>({
    resolver: zodResolver(calificacionSchema),
    defaultValues: calificacionPropia ?? { rating: 5, comment: "" },
  });

  const onSubmit = async (data: CalificacionInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await guardarCalificacion(productId, productSlug, data);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <section className="flex flex-col gap-6 border-t border-brand-rosa-claro pt-8">
      <h2 className="font-heading text-xl text-brand-ciruela">Calificaciones</h2>

      {calificaciones.length === 0 ? (
        <p className="text-sm text-brand-ciruela/60">
          Todavía no hay calificaciones para este producto.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {calificaciones.map((calificacion) => (
            <div
              key={calificacion.id}
              className="flex flex-col gap-1 border-b border-brand-rosa-claro/60 pb-4"
            >
              <div className="flex items-center gap-2">
                <div className="flex" aria-hidden>
                  {[1, 2, 3, 4, 5].map((estrella) => (
                    <Star
                      key={estrella}
                      className="h-4 w-4 text-brand-oro"
                      fill={estrella <= calificacion.rating ? "currentColor" : "none"}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-brand-ciruela">
                  {calificacion.autorNombre}
                </span>
              </div>
              {calificacion.comment && (
                <p className="text-sm text-brand-ciruela/80">{calificacion.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {estaAutenticado ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-md flex-col gap-3">
          <p className="text-sm text-brand-ciruela">
            {calificacionPropia ? "Actualiza tu calificación" : "Califica este producto"}
          </p>
          <Controller
            control={control}
            name="rating"
            render={({ field }) => (
              <EstrellasInput value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.rating && <p className="text-sm text-red-600">{errors.rating.message}</p>}
          <textarea
            rows={3}
            placeholder="Cuéntanos qué te pareció (opcional)"
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            {...register("comment")}
          />
          {errors.comment && <p className="text-sm text-red-600">{errors.comment.message}</p>}
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          {success && <p className="text-sm text-green-700">¡Gracias por tu calificación!</p>}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
          >
            {isSubmitting
              ? "Guardando..."
              : calificacionPropia
                ? "Actualizar"
                : "Enviar calificación"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-brand-ciruela/60">
          <Link href="/login" className="text-brand-rosa hover:underline">
            Inicia sesión
          </Link>{" "}
          para calificar este producto.
        </p>
      )}
    </section>
  );
}
