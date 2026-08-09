"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { proveedorSchema, type ProveedorInput } from "@/lib/validation/proveedor";
import { createProveedor, updateProveedor } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProveedorForm({
  proveedorId,
  defaultValues,
}: {
  proveedorId?: string;
  defaultValues: ProveedorInput;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorSchema),
    defaultValues,
  });

  const onSubmit = async (data: ProveedorInput) => {
    setServerError(null);
    const result = proveedorId
      ? await updateProveedor(proveedorId, data)
      : await createProveedor(data);

    if (result?.error) {
      setServerError(result.error);
      return;
    }

    router.push("/admin/compras/proveedores");
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
      <div>
        <label htmlFor="phone" className="text-sm text-brand-ciruela">
          Teléfono (opcional)
        </label>
        <Input id="phone" {...register("phone")} />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-ciruela">
        <input type="checkbox" {...register("isActive")} />
        Activo
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
