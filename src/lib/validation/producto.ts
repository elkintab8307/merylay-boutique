import { z } from "zod";

export const varianteSchema = z
  .object({
    talla: z.string().trim().optional(),
    color: z.string().trim().optional(),
    priceOverride: z.number().min(0).nullable(),
    stock: z.number().int().min(0),
  })
  .refine((data) => Boolean(data.talla) || Boolean(data.color), {
    message: "Ingresa talla, color, o ambos",
    path: ["talla"],
  });

export type VarianteInput = z.infer<typeof varianteSchema>;

export const productoSchema = z
  .object({
    name: z.string().trim().min(2, "Ingresa un nombre de al menos 2 caracteres"),
    slug: z.string().trim().min(2, "El slug debe tener al menos 2 caracteres"),
    description: z.string().trim().optional(),
    categoryId: z.string().uuid().nullable(),
    price: z.number().min(0, "El precio no puede ser negativo"),
    compareAtPrice: z.number().min(0).nullable(),
    costPrice: z.number().min(0, "El costo no puede ser negativo").nullable(),
    stock: z.number().int().min(0),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    variantes: z.array(varianteSchema),
  })
  .refine(
    (data) => {
      const combinaciones = data.variantes.map(
        (v) =>
          `${(v.talla ?? "").trim().toLowerCase()}|${(v.color ?? "").trim().toLowerCase()}`,
      );
      return new Set(combinaciones).size === combinaciones.length;
    },
    {
      message: "Ya existe una variante con esa talla y color.",
      path: ["variantes"],
    },
  );

export type ProductoInput = z.infer<typeof productoSchema>;
