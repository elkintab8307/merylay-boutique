import { z } from "zod";

export const calificacionSchema = z.object({
  rating: z.number().int().min(1, "Elige de 1 a 5 estrellas").max(5, "Elige de 1 a 5 estrellas"),
  comment: z.string().trim().max(500, "El comentario es demasiado largo"),
});

export type CalificacionInput = z.infer<typeof calificacionSchema>;
