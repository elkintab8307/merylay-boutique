import { z } from "zod";
import { generarSkuVariante } from "@/lib/sku";

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
      // Se compara por el sufijo de SKU que generarSkuVariante realmente
      // produciria (mismo normalizado que usan createProducto/updateProducto
      // al insertar en product_variants, que tiene sku unique not null) en
      // vez de la talla/color crudos: dos variantes con texto distinto
      // ("S" y "S!") pueden normalizarse al mismo SKU y romper esa
      // restriccion en la base de datos con un error confuso y el producto
      // ya creado sin variantes. Comparar por el SKU real detecta ese caso
      // aqui, antes de enviar el formulario.
      const sufijos = data.variantes.map((v) =>
        generarSkuVariante("", v.talla || null, v.color || null),
      );
      return new Set(sufijos).size === sufijos.length;
    },
    {
      message:
        "Dos variantes generan el mismo código interno — revisa que la talla y el color no sean iguales o equivalentes entre ellas.",
      path: ["variantes"],
    },
  );

export type ProductoInput = z.infer<typeof productoSchema>;
