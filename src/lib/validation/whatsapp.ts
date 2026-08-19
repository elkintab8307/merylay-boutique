import { z } from "zod";

export const whatsappSchema = z
  .string()
  .trim()
  .min(7, "Ingresa un número de WhatsApp válido")
  .refine((v) => v.replace(/\D/g, "").length >= 7, {
    message: "Ingresa un número de WhatsApp válido",
  });
