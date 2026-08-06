import { z } from "zod";

export const categoriaSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
  description: z.string().trim().optional(),
  parentId: z.string().uuid().nullable(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

export type CategoriaInput = z.infer<typeof categoriaSchema>;
