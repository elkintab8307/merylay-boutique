"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { confirmarPedido } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CheckoutForm() {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "transferencia" },
  });

  const onSubmit = async (data: CheckoutInput) => {
    setServerError(null);
    const result = await confirmarPedido(data);
    if (result?.error) {
      setServerError(result.error);
    }
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
        <label htmlFor="phone" className="text-sm text-brand-ciruela">
          Teléfono
        </label>
        <Input id="phone" {...register("phone")} />
        {errors.phone && <p className="text-sm text-red-600">{errors.phone.message}</p>}
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
      <div>
        <label htmlFor="city" className="text-sm text-brand-ciruela">
          Ciudad
        </label>
        <Input id="city" {...register("city")} />
        {errors.city && <p className="text-sm text-red-600">{errors.city.message}</p>}
      </div>
      <div>
        <label htmlFor="notes" className="text-sm text-brand-ciruela">
          Notas (opcional)
        </label>
        <Input id="notes" {...register("notes")} />
      </div>
      <div>
        <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
          Método de pago
        </label>
        <select
          id="paymentMethod"
          {...register("paymentMethod")}
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia bancaria</option>
          <option value="nequi">Nequi</option>
          <option value="daviplata">Daviplata</option>
        </select>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Procesando..." : "Confirmar pedido"}
      </Button>
    </form>
  );
}
