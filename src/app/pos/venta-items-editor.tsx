"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Banknote, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import { PaymentMethodPicker, type PaymentMethodOption } from "./payment-method-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import {
  mergeCartItem,
  updateItemQty,
  removeItem,
  computeSubtotal,
  type LocalCartItem,
} from "@/lib/cart/local-cart";
import { ProductBrowser } from "./product-browser";
import type { Database } from "@/lib/supabase/database.types";
import type { CreditoVentaInput } from "@/lib/validation/credito";
import { ClienteSelector, type ClienteSeleccionado } from "./cliente-selector";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia", "nequi", "daviplata"] as const;

const METODOS_ABONO_OPTIONS: PaymentMethodOption<(typeof METODOS_ABONO)[number]>[] = [
  { value: "efectivo", label: "Efectivo", Icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", Icon: CreditCard },
  { value: "transferencia", label: "Transferencia", Icon: Landmark },
  { value: "nequi", label: "Nequi", Icon: Smartphone },
  { value: "daviplata", label: "Daviplata", Icon: Smartphone },
];

export function VentaItemsEditor({
  itemsIniciales = [],
  discountInicial = 0,
  paymentMethodInicial = "efectivo",
  clienteInicial = null,
  mostrarDescuento = true,
  mostrarMetodoPago = true,
  mostrarCliente = true,
  permitirCredito = true,
  textoBoton,
  textoBotonEnviando,
  onGuardar,
}: {
  itemsIniciales?: LocalCartItem[];
  discountInicial?: number;
  paymentMethodInicial?: PaymentMethod;
  clienteInicial?: ClienteSeleccionado | null;
  mostrarDescuento?: boolean;
  mostrarMetodoPago?: boolean;
  mostrarCliente?: boolean;
  permitirCredito?: boolean;
  textoBoton: string;
  textoBotonEnviando: string;
  onGuardar: (
    items: LocalCartItem[],
    paymentMethod: PaymentMethod,
    discount: number,
    credito: CreditoVentaInput | null,
    customerId: string | null,
  ) => Promise<{ error?: string } | void>;
}) {
  const [items, setItems] = useState<LocalCartItem[]>(itemsIniciales);
  const [discount, setDiscount] = useState(discountInicial);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethodInicial);
  const [cliente, setCliente] = useState<ClienteSeleccionado | null>(clienteInicial ?? null);
  const [numCuotas, setNumCuotas] = useState(1);
  const [abonoInicial, setAbonoInicial] = useState(0);
  const [abonoInicialMetodo, setAbonoInicialMetodo] = useState<
    (typeof METODOS_ABONO)[number] | ""
  >("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const subtotal = computeSubtotal(items);
  const total = Math.max(subtotal - discount, 0);
  const esCredito = paymentMethod === "credito" && permitirCredito;

  const metodosPagoPrincipal: PaymentMethodOption<PaymentMethod>[] = [
    { value: "efectivo", label: "Efectivo", Icon: Banknote },
    { value: "tarjeta", label: "Tarjeta", Icon: CreditCard },
    { value: "transferencia", label: "Transferencia", Icon: Landmark },
    { value: "nequi", label: "Nequi", Icon: Smartphone },
    { value: "daviplata", label: "Daviplata", Icon: Smartphone },
    ...(permitirCredito
      ? [{ value: "credito" as PaymentMethod, label: "Crédito", Icon: Wallet }]
      : []),
  ];

  const handleAdd = (item: LocalCartItem) => {
    setItems((prev) => mergeCartItem(prev, item));
  };

  const handleUpdateQty = (productId: string, variantId: string | null, qty: number) => {
    setItems((prev) => updateItemQty(prev, productId, variantId, qty));
  };

  const handleRemove = (productId: string, variantId: string | null) => {
    setItems((prev) => removeItem(prev, productId, variantId));
  };

  const handleSubmit = () => {
    setError(null);

    if (esCredito) {
      if (!cliente) {
        setError("Selecciona el cliente para la venta a crédito.");
        return;
      }
      if (numCuotas < 1) {
        setError("El número de cuotas debe ser al menos 1.");
        return;
      }
      if (abonoInicial > 0 && !abonoInicialMetodo) {
        setError("Selecciona el método de pago del abono inicial.");
        return;
      }
    }

    startSubmit(async () => {
      const credito: CreditoVentaInput | null = esCredito
        ? {
            numCuotas,
            abonoInicial,
            abonoInicialMetodo: abonoInicialMetodo || null,
          }
        : null;
      const result = await onGuardar(items, paymentMethod, discount, credito, cliente?.id ?? null);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductBrowser onAdd={handleAdd} />

      <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        <h2 className="font-heading text-xl text-brand-ciruela">Venta actual</h2>
        {items.length === 0 ? (
          <p className="text-sm text-brand-ciruela/60">
            Todavía no hay productos en la venta.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-brand-rosa-claro">
            {items.map((item) => (
              <div
                key={`${item.productId}-${item.variantId ?? "base"}`}
                className="flex items-center gap-2 py-2"
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
                  {item.imageUrl && (
                    <Image src={item.imageUrl} alt={item.name} fill className="object-contain" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-brand-ciruela">{item.name}</p>
                  <p className="text-xs text-brand-ciruela/60">{formatPrice(item.unitPrice)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty - 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => handleUpdateQty(item.productId, item.variantId, item.qty + 1)}
                  className="h-11 w-11 rounded-md border border-brand-rosa-claro text-brand-ciruela"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {mostrarDescuento && (
          <div>
            <label htmlFor="discount" className="text-sm text-brand-ciruela">
              Descuento (pesos)
            </label>
            <Input
              id="discount"
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        )}

        {mostrarMetodoPago && (
          <div>
            <label className="text-sm text-brand-ciruela">Método de pago</label>
            <PaymentMethodPicker
              options={metodosPagoPrincipal}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </div>
        )}

        {mostrarCliente && (
          <ClienteSelector
            cliente={cliente}
            onChange={setCliente}
            requerido={esCredito}
          />
        )}

        {esCredito && (
          <div className="flex flex-col gap-3 rounded-md border border-brand-oro/50 bg-brand-oro/10 p-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand-ciruela" />
              <p className="text-sm font-semibold text-brand-ciruela">Datos del crédito</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="numCuotas" className="text-sm text-brand-ciruela">
                  Número de cuotas
                </label>
                <Input
                  id="numCuotas"
                  type="number"
                  min={1}
                  value={numCuotas}
                  onChange={(e) => setNumCuotas(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <label htmlFor="abonoInicial" className="text-sm text-brand-ciruela">
                  Abono inicial (opcional)
                </label>
                <Input
                  id="abonoInicial"
                  type="number"
                  min={0}
                  value={abonoInicial}
                  onChange={(e) => setAbonoInicial(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            {abonoInicial > 0 && (
              <div>
                <label className="text-sm text-brand-ciruela">
                  Método de pago del abono inicial
                </label>
                <PaymentMethodPicker
                  options={METODOS_ABONO_OPTIONS}
                  value={abonoInicialMetodo}
                  onChange={setAbonoInicialMetodo}
                  compact
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1 border-t border-brand-rosa-claro pt-3 text-sm text-brand-ciruela">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {mostrarDescuento && (
            <div className="flex justify-between">
              <span>Descuento</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-heading text-lg text-brand-rosa">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={items.length === 0 || isSubmitting}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isSubmitting ? textoBotonEnviando : textoBoton}
        </Button>
      </div>
    </div>
  );
}
