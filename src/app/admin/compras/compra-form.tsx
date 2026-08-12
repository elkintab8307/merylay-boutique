"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { compraSchema, type CompraInput } from "@/lib/validation/compra";
import { iniciarCompra } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";

type ProveedorOption = { id: string; name: string };
type VarianteOption = { id: string; name: string; sku: string };
type ProductoOption = { id: string; name: string; sku: string; variantes: VarianteOption[] };

export function CompraForm({
  proveedores,
  productos,
}: {
  proveedores: ProveedorOption[];
  productos: ProductoOption[];
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CompraInput>({
    resolver: zodResolver(compraSchema),
    defaultValues: {
      supplierId: "",
      purchaseDate: new Date().toISOString().slice(0, 10),
      items: [{ productId: "", variantId: null, qty: 1, unitCost: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const total = items.reduce((sum, item) => sum + (item.qty || 0) * (item.unitCost || 0), 0);

  const onSubmit = async (data: CompraInput) => {
    setServerError(null);
    const result = await iniciarCompra(data);
    if (result?.error) {
      setServerError(result.error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="supplierId" className="text-sm text-brand-ciruela">
            Proveedor
          </label>
          <select
            id="supplierId"
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
            {...register("supplierId")}
          >
            <option value="">Selecciona un proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="text-sm text-red-600">{errors.supplierId.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="purchaseDate" className="text-sm text-brand-ciruela">
            Fecha
          </label>
          <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
          {errors.purchaseDate && (
            <p className="text-sm text-red-600">{errors.purchaseDate.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg text-brand-ciruela">Productos</h2>
          <Button
            type="button"
            variant="outline"
            onClick={() => append({ productId: "", variantId: null, qty: 1, unitCost: 0 })}
            className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar producto
          </Button>
        </div>
        {fields.map((field, index) => {
          const selectedProductId = watch(`items.${index}.productId`);
          const variantes = productos.find((p) => p.id === selectedProductId)?.variantes ?? [];

          return (
            <div
              key={field.id}
              className="grid grid-cols-1 items-end gap-3 rounded-md border border-brand-rosa-claro p-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]"
            >
              <div>
                <label className="text-sm text-brand-ciruela">Producto</label>
                <select
                  className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
                  {...register(`items.${index}.productId` as const, {
                    onChange: () => {
                      setValue(`items.${index}.variantId`, null);
                    },
                  })}
                >
                  <option value="">Selecciona un producto</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-brand-ciruela">
                  Variante {variantes.length === 0 && "(sin variantes)"}
                </label>
                <select
                  className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm disabled:bg-brand-crema disabled:text-brand-ciruela/40"
                  disabled={variantes.length === 0}
                  {...register(`items.${index}.variantId` as const, {
                    setValueAs: (v) => (v === "" ? null : v),
                  })}
                >
                  <option value="">{variantes.length > 0 ? "Selecciona una variante" : "-"}</option>
                  {variantes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.sku})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-brand-ciruela">Cantidad</label>
                <Input
                  type="number"
                  {...register(`items.${index}.qty` as const, { valueAsNumber: true })}
                />
              </div>
              <div>
                <label className="text-sm text-brand-ciruela">Costo unitario</label>
                <Input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.unitCost` as const, { valueAsNumber: true })}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
              >
                Quitar
              </Button>
              {errors.items?.[index]?.productId && (
                <p className="col-span-5 text-sm text-red-600">
                  {errors.items[index]?.productId?.message}
                </p>
              )}
              {errors.items?.[index]?.qty && (
                <p className="col-span-5 text-sm text-red-600">
                  {errors.items[index]?.qty?.message}
                </p>
              )}
              {errors.items?.[index]?.unitCost && (
                <p className="col-span-5 text-sm text-red-600">
                  {errors.items[index]?.unitCost?.message}
                </p>
              )}
            </div>
          );
        })}
        {errors.items?.message && (
          <p className="text-sm text-red-600">{errors.items.message}</p>
        )}
      </div>

      <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <p className="text-sm text-brand-ciruela/70">Total de la compra</p>
        <p className="font-heading text-2xl text-brand-rosa">{formatPrice(total)}</p>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isSubmitting ? "Registrando..." : "Registrar compra"}
      </Button>
    </form>
  );
}
