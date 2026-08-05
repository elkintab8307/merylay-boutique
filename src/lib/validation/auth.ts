import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresa tu usuario o correo electrónico"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registroSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
    email: z.email("Ingresa un correo electrónico válido").trim(),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegistroInput = z.infer<typeof registroSchema>;
