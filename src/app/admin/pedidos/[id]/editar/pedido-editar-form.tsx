"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { actualizarPedidoItems } from "./actions";

export function PedidoEditarForm({
  orderId,
  itemsIniciales,
}: {
  orderId: string;
  itemsIniciales: LocalCartItem[];
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      mostrarDescuento={false}
      mostrarMetodoPago={false}
      mostrarCliente={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items) => actualizarPedidoItems(orderId, items)}
    />
  );
}
