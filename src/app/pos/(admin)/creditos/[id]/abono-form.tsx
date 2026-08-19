"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { abonoSchema, type AbonoInput } from "@/lib/validation/credito";
import { registrarAbono } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AbonoForm({ saleId }: { saleId: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AbonoInput>({
    resolver: zodResolver(abonoSchema),
    defaultValues: { amount: 0, paymentMethod: "efectivo" },
  });

  const onSubmit = async (data: AbonoInput) => {
    setServerError(null);
    const result = await registrarAbono(saleId, data);
    if (result?.error) {
      setServerError(result.error);
      return;
    }
    reset({ amount: 0, paymentMethod: "efectivo" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <label htmlFor="amount" className="text-sm text-brand-ciruela">
          Monto del abono
        </label>
        <Input
          id="amount"
          type="number"
          step="1"
          {...register("amount", { valueAsNumber: true })}
        />
        {errors.amount && <p className="text-sm text-red-600">{errors.amount.message}</p>}
      </div>
      <div>
        <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
          Método de pago
        </label>
        <select
          id="paymentMethod"
          className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          {...register("paymentMethod")}
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
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
        {isSubmitting ? "Registrando..." : "Registrar abono"}
      </Button>
    </form>
  );
}
