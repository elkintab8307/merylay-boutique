import { z } from "zod";

export const rangoFechaSchema = z
  .object({
    desde: z.iso.date("Ingresa una fecha válida"),
    hasta: z.iso.date("Ingresa una fecha válida"),
  })
  .refine((data) => data.hasta >= data.desde, {
    message: "La fecha final no puede ser anterior a la inicial",
    path: ["hasta"],
  });

export type RangoFechaInput = z.infer<typeof rangoFechaSchema>;
