import { z } from "zod";

const heroSchema = z.object({
  imagenesDesktop: z.array(z.string()).max(3),
  imagenesMobile: z.array(z.string()).max(3),
});

const heroLegacySchema = z.object({
  imageUrl: z.string().nullable().optional(),
  imageUrlMobile: z.string().nullable().optional(),
});

const bannerSchema = z.object({
  imageUrl: z.string().nullable(),
  titulo: z.string().trim(),
  link: z.string().trim(),
});

export type HeroContenido = z.infer<typeof heroSchema>;
export type BannerContenido = z.infer<typeof bannerSchema>;

export const heroStoredSchema = heroSchema;
export const bannersStoredSchema = z.array(bannerSchema);

/**
 * El hero paso de {imageUrl, imageUrlMobile, titulo, ...} a
 * {imagenesDesktop[], imagenesMobile[]}. Un valor guardado con la forma
 * anterior no matchea el nuevo schema, asi que se migra en el momento de
 * leerlo (sin tocar la base de datos) para no perder la imagen ya subida.
 */
export function parseHeroStored(value: unknown): HeroContenido | null {
  const parsed = heroStoredSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const legacy = heroLegacySchema.safeParse(value);
  if (legacy.success && (legacy.data.imageUrl || legacy.data.imageUrlMobile)) {
    return {
      imagenesDesktop: legacy.data.imageUrl ? [legacy.data.imageUrl] : [],
      imagenesMobile: legacy.data.imageUrlMobile ? [legacy.data.imageUrlMobile] : [],
    };
  }

  return null;
}

const bannerInputSchema = z
  .object({
    titulo: z.string().trim(),
    link: z.string().trim(),
  })
  .refine((data) => !data.titulo || data.link.length > 0, {
    message: "Ingresa un link para este banner",
    path: ["link"],
  });

export const homeContenidoSchema = z.object({
  banner1: bannerInputSchema,
  banner2: bannerInputSchema,
});

export type HomeContenidoInput = z.infer<typeof homeContenidoSchema>;
