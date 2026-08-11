import { z } from "zod";

const heroSchema = z.object({
  imageUrl: z.string().nullable(),
  titulo: z.string().trim().min(1, "Ingresa un título"),
  subtitulo: z.string().trim(),
  textoBoton: z.string().trim().min(1, "Ingresa el texto del botón"),
  linkBoton: z.string().trim().min(1, "Ingresa un link"),
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

const heroInputSchema = z.object({
  titulo: z.string().trim().min(1, "Ingresa un título"),
  subtitulo: z.string().trim(),
  textoBoton: z.string().trim().min(1, "Ingresa el texto del botón"),
  linkBoton: z.string().trim().min(1, "Ingresa un link"),
});

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
  hero: heroInputSchema,
  banner1: bannerInputSchema,
  banner2: bannerInputSchema,
});

export type HomeContenidoInput = z.infer<typeof homeContenidoSchema>;
