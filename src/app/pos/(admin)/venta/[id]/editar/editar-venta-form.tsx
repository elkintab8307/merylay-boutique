"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { Database } from "@/lib/supabase/database.types";
import { actualizarVenta } from "./actions";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditarVentaForm({
  saleId,
  itemsIniciales,
  discountInicial,
  paymentMethodInicial,
}: {
  saleId: string;
  itemsIniciales: LocalCartItem[];
  discountInicial: number;
  paymentMethodInicial: PaymentMethod;
}) {
  return (
    <VentaItemsEditor
      itemsIniciales={itemsIniciales}
      discountInicial={discountInicial}
      paymentMethodInicial={paymentMethodInicial}
      permitirCredito={false}
      textoBoton="Guardar cambios"
      textoBotonEnviando="Guardando..."
      onGuardar={(items, paymentMethod, discount) =>
        actualizarVenta(saleId, items, paymentMethod, discount)
      }
    />
  );
}
