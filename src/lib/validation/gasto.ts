import { z } from "zod";

export const gastoSchema = z.object({
  categoryId: z.string().uuid("Selecciona una categoría válida"),
  description: z.string().trim().min(3, "Ingresa una descripción de al menos 3 caracteres"),
  amount: z.number().positive("El monto debe ser mayor a cero"),
  expenseDate: z
    .string()
    .refine((fecha) => fecha <= new Date().toISOString().slice(0, 10), {
      message: "La fecha no puede ser futura",
    }),
});

export type GastoInput = z.infer<typeof gastoSchema>;

export const expenseCategoriaSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  isActive: z.boolean(),
});

export type ExpenseCategoriaInput = z.infer<typeof expenseCategoriaSchema>;
