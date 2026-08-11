import { z } from "zod";

export type HeroContenido = {
  imageUrl: string | null;
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  linkBoton: string;
};

export type BannerContenido = {
  imageUrl: string | null;
  titulo: string;
  link: string;
};

const heroSchema = z.object({
  titulo: z.string().trim().min(1, "Ingresa un título"),
  subtitulo: z.string().trim(),
  textoBoton: z.string().trim().min(1, "Ingresa el texto del botón"),
  linkBoton: z.string().trim().min(1, "Ingresa un link"),
});

const bannerSchema = z
  .object({
    titulo: z.string().trim(),
    link: z.string().trim(),
  })
  .refine((data) => !data.titulo || data.link.length > 0, {
    message: "Ingresa un link para este banner",
    path: ["link"],
  });

export const homeContenidoSchema = z.object({
  hero: heroSchema,
  banner1: bannerSchema,
  banner2: bannerSchema,
});

export type HomeContenidoInput = z.infer<typeof homeContenidoSchema>;
