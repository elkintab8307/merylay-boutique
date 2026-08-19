import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresa tu usuario o correo electrónico"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registroSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
    whatsapp: z
      .string()
      .trim()
      .min(7, "Ingresa un número de WhatsApp válido")
      .refine((v) => v.replace(/\D/g, "").length >= 7, {
        message: "Ingresa un número de WhatsApp válido",
      }),
    address: z.string().trim().min(5, "Ingresa una dirección válida"),
    email: z
      .email("Ingresa un correo electrónico válido")
      .trim()
      .optional()
      .or(z.literal("")),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegistroInput = z.infer<typeof registroSchema>;
