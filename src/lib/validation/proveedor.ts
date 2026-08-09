import { z } from "zod";

export const proveedorSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  phone: z.string().trim().optional(),
  isActive: z.boolean(),
});

export type ProveedorInput = z.infer<typeof proveedorSchema>;
