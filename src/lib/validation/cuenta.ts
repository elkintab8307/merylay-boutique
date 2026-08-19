import { z } from "zod";
import { whatsappSchema } from "./whatsapp";

export const perfilSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
  whatsapp: whatsappSchema,
  address: z.string().trim().min(5, "Ingresa una dirección válida"),
});

export type PerfilInput = z.infer<typeof perfilSchema>;
