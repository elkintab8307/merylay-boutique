import { z } from "zod";

export const compraSchema = z.object({
  supplierId: z.string().uuid("Selecciona un proveedor válido"),
  purchaseDate: z
    .iso.date("Ingresa una fecha válida")
    .refine((fecha) => fecha <= new Date().toISOString().slice(0, 10), {
      message: "La fecha no puede ser futura",
    }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Selecciona un producto válido"),
        qty: z.number().int().positive("La cantidad debe ser mayor a cero"),
        unitCost: z.number().positive("El costo unitario debe ser mayor a cero"),
      }),
    )
    .min(1, "Agrega al menos un producto"),
});

export type CompraInput = z.infer<typeof compraSchema>;
