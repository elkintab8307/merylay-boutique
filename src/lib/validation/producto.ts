import { z } from "zod";

export const varianteSchema = z
  .object({
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    sku: z.string().trim().min(1, "El SKU de la variante es obligatorio"),
    priceOverride: z.number().min(0).nullable(),
    stock: z.number().int().min(0),
  })
  .refine((data) => Boolean(data.talla) || Boolean(data.color), {
    message: "Ingresa talla, color, o ambos",
    path: ["talla"],
  });

export type VarianteInput = z.infer<typeof varianteSchema>;

export const productoSchema = z.object({
  name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
  slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
  description: z.string().trim().optional(),
  categoryId: z.string().uuid().nullable(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  compareAtPrice: z.number().min(0).nullable(),
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  stock: z.number().int().min(0),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  variantes: z.array(varianteSchema),
});

export type ProductoInput = z.infer<typeof productoSchema>;
