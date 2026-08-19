import { z } from "zod";

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

export const creditoVentaSchema = z
  .object({
    clienteNombre: z.string().trim().min(2, "Ingresa el nombre del cliente"),
    clienteTelefono: z.string().trim().min(7, "Ingresa un teléfono válido"),
    numCuotas: z
      .number()
      .int()
      .min(1, "Debe haber al menos 1 cuota")
      .max(60, "Máximo 60 cuotas"),
    abonoInicial: z.number().min(0, "El abono inicial no puede ser negativo"),
    abonoInicialMetodo: z.enum(METODOS_ABONO).nullable(),
  })
  .refine((data) => data.abonoInicial === 0 || data.abonoInicialMetodo !== null, {
    message: "Selecciona el método de pago del abono inicial",
    path: ["abonoInicialMetodo"],
  });

export type CreditoVentaInput = z.infer<typeof creditoVentaSchema>;

export const abonoSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a cero"),
  paymentMethod: z.enum(METODOS_ABONO),
});

export type AbonoInput = z.infer<typeof abonoSchema>;
