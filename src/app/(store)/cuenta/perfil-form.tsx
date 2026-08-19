"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { perfilSchema, type PerfilInput } from "@/lib/validation/cuenta";
import { actualizarPerfil } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PerfilForm({ defaultValues }: { defaultValues: PerfilInput }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PerfilInput>({
    resolver: zodResolver(perfilSchema),
    defaultValues,
  });

  const onSubmit = async (data: PerfilInput) => {
    setServerError(null);
    setSuccess(false);
    const result = await actualizarPerfil(data);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSuccess(true);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="fullName" className="text-sm text-brand-ciruela">
          Nombre completo
        </label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-red-600">{errors.fullName.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="whatsapp" className="text-sm text-brand-ciruela">
          WhatsApp
        </label>
        <Input id="whatsapp" type="tel" {...register("whatsapp")} />
        {errors.whatsapp && (
          <p className="text-sm text-red-600">{errors.whatsapp.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="address" className="text-sm text-brand-ciruela">
          Dirección
        </label>
        <Input id="address" {...register("address")} />
        {errors.address && (
          <p className="text-sm text-red-600">{errors.address.message}</p>
        )}
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && (
        <p className="text-sm text-green-700">Datos actualizados.</p>
      )}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Guardando..." : "Guardar datos"}
      </Button>
    </form>
  );
}
