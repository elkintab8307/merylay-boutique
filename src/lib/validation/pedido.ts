import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Única fuente de verdad de los estados de un pedido: el schema de validación,
 * el orden en que se muestran y sus etiquetas en español salen todos de aquí.
 * El `satisfies` los ancla al enum `order_status` de la base de datos.
 */
const VALORES_ESTADO_PEDIDO = [
  "pendiente",
  "pagado",
  "enviado",
  "entregado",
  "cancelado",
] as const satisfies readonly Database["public"]["Enums"]["order_status"][];

export const estadoPedidoSchema = z.enum(VALORES_ESTADO_PEDIDO);

export type EstadoPedido = z.infer<typeof estadoPedidoSchema>;

export const ESTADO_PEDIDO_LABELS: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  pagado: "Pagado",
  enviado: "Enviado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/** Lista ordenada lista para pintar `<option>`s o filtros. */
export const ESTADOS_PEDIDO: ReadonlyArray<{
  value: EstadoPedido;
  label: string;
}> = VALORES_ESTADO_PEDIDO.map((value) => ({
  value,
  label: ESTADO_PEDIDO_LABELS[value],
}));
