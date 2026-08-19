import { z } from "zod";

export const perfilSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
  whatsapp: z.string().trim().min(7, "Ingresa un número de WhatsApp válido"),
  address: z.string().trim().min(5, "Ingresa una dirección válida"),
});

export type PerfilInput = z.infer<typeof perfilSchema>;
