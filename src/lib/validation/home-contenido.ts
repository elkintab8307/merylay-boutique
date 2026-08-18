import { z } from "zod";

const heroSchema = z.object({
  imageUrl: z.string().nullable(),
  imageUrlMobile: z.string().nullable().default(null),
  titulo: z.string().trim(),
  subtitulo: z.string().trim(),
  textoBoton: z.string().trim(),
  linkBoton: z.string().trim(),
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

const heroInputSchema = z
  .object({
    titulo: z.string().trim(),
    subtitulo: z.string().trim(),
    textoBoton: z.string().trim(),
    linkBoton: z.string().trim(),
  })
  .refine((data) => !data.titulo || data.textoBoton.length > 0, {
    message: "Ingresa el texto del botón",
    path: ["textoBoton"],
  })
  .refine((data) => !data.titulo || data.linkBoton.length > 0, {
    message: "Ingresa un link para el botón",
    path: ["linkBoton"],
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
