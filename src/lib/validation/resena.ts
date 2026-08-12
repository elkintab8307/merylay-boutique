import { z } from "zod";

export const resenaSchema = z.object({
  customerName: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  body: z.string().trim().min(10, "Ingresa un texto de al menos 10 caracteres"),
  rating: z
    .number()
    .int()
    .min(1, "La calificación debe ser entre 1 y 5")
    .max(5, "La calificación debe ser entre 1 y 5"),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

export type ResenaInput = z.infer<typeof resenaSchema>;
