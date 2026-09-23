"use client";

import { VentaItemsEditor } from "@/app/pos/venta-items-editor";
import type { ClienteSeleccionado } from "@/app/pos/cliente-selector";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { formatPrice } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { actualizarVenta, type DestinoTrasEditar } from "./actions";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditarVentaForm({
  saleId,
  itemsIniciales,
  discountInicial,
  paymentMethodInicial,
  clienteInicial,
  credito,
  destino = "recibo",
}: {
  saleId: string;
  itemsIniciales: LocalCartItem[];
  discountInicial: number;
  paymentMethodInicial: PaymentMethod;
  clienteInicial: ClienteSeleccionado | null;
  // Solo se pasa cuando la venta es un credito: lo ya abonado y el saldo
  // actual (total - abonado), para el aviso de arriba.
  credito?: { abonado: number; saldo: number };
  // Adonde vuelve el usuario al guardar: el recibo de la venta (Ventas) o el
  // detalle del credito (Creditos).
  destino?: DestinoTrasEditar;
}) {
  const esCredito = credito !== undefined;

  return (
    <>
      {credito && (
        <div
          role="note"
          className="mb-6 rounded-lg border border-brand-oro bg-brand-oro/10 p-4 text-sm text-brand-ciruela"
        >
          <p className="font-semibold">Editando un crédito</p>
          <p>
            Abonado hasta ahora: {formatPrice(credito.abonado)} · Saldo actual:{" "}
            {formatPrice(credito.saldo)}.
          </p>
          <p>
            Los abonos se conservan. Al guardar, el saldo nuevo se reparte en
            las cuotas pendientes. El nuevo total no puede ser menor a lo ya
            abonado.
          </p>
        </div>
      )}
      <VentaItemsEditor
        itemsIniciales={itemsIniciales}
        discountInicial={discountInicial}
        paymentMethodInicial={paymentMethodInicial}
        clienteInicial={clienteInicial}
        permitirCredito={false}
        // Un credito sigue siendo credito: no se ofrece cambiar el metodo de
        // pago, y siempre debe tener cliente.
        mostrarMetodoPago={!esCredito}
        clienteObligatorio={esCredito}
        // En movil el resumen (items, descuento, cliente, total y guardar)
        // va arriba y los productos debajo.
        resumenPrimeroEnMovil
        textoBoton="Guardar cambios"
        textoBotonEnviando="Guardando..."
        onGuardar={(items, paymentMethod, discount, _credito, customerId) =>
          actualizarVenta(saleId, items, paymentMethod, discount, customerId, destino)
        }
      />
    </>
  );
}
