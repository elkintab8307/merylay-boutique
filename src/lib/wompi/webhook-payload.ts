import { z } from "zod";

// Forma minima que necesita el webhook para poder al menos intentar
// verificar la firma y, si es valida, actuar sobre un pedido. Los cuatro
// campos de `transaction` son obligatorios porque el manejador no puede
// funcionar sin ellos (referencia del pedido, estado, id de transaccion de
// Wompi y monto para la verificacion cruzada contra el total del pedido).
export const eventoWompiSchema = z.object({
  data: z.object({
    transaction: z.object({
      id: z.string(),
      reference: z.string(),
      status: z.string(),
      amount_in_cents: z.number(),
    }),
  }),
  signature: z.object({
    properties: z.array(z.string()),
    checksum: z.string(),
  }),
  timestamp: z.number(),
});

export type EventoWompi = z.infer<typeof eventoWompiSchema>;
