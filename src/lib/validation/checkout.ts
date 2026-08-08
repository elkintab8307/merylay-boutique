import { z } from "zod";

export const checkoutSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresa tu nombre completo"),
  phone: z.string().trim().min(7, "Ingresa un teléfono válido"),
  address: z.string().trim().min(5, "Ingresa una dirección válida"),
  city: z.string().trim().min(2, "Ingresa tu ciudad"),
  notes: z.string().trim().optional(),
  paymentMethod: z.enum(["efectivo", "transferencia", "wompi"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
