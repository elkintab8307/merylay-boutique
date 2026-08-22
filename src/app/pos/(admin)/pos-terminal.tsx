"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito) =>
        registrarVenta(items, paymentMethod, discount, credito)
      }
    />
  );
}
