"use client";

import { VentaItemsEditor } from "./venta-items-editor";
import { registrarVenta } from "./sale-action";

export function PosTerminal() {
  return (
    <VentaItemsEditor
      textoBoton="Registrar venta"
      textoBotonEnviando="Registrando..."
      onGuardar={(items, paymentMethod, discount) =>
        registrarVenta(items, paymentMethod, discount)
      }
    />
  );
}
