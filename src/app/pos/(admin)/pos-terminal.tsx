"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import { registrarVenta } from "@/app/pos/sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      mobileVistaDoble
      clienteObligatorio
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount, credito, customerId) =>
        registrarVenta(items, paymentMethod, discount, credito, customerId)
      }
    />
  );
}
