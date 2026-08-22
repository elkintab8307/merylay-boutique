"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { ClienteSeleccionado } from "@/app/pos/cliente-selector";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { Database } from "@/lib/supabase/database.types";
import { actualizarVenta } from "./actions";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditarVentaForm({
  saleId,
  itemsIniciales,
  discountInicial,
  paymentMethodInicial,
  clienteInicial,
}: {
  saleId: string;
  itemsIniciales: LocalCartItem[];
  discountInicial: number;
  paymentMethodInicial: PaymentMethod;
  clienteInicial: ClienteSeleccionado | null;
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      discountInicial={discountInicial}
      paymentMethodInicial={paymentMethodInicial}
      clienteInicial={clienteInicial}
      permitirCredito={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items, paymentMethod, discount, _credito, customerId) =>
        actualizarVenta(saleId, items, paymentMethod, discount, customerId)
      }
    />
  );
}
