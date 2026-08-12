"use client";

import { useState, useTransition } from "react";
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
import { searchProducts, type PosSearchResult } from "./search-action";
import { registrarVenta } from "./sale-action";
import { ProductSearchResult } from "./product-search-result";
import type { Database } from "@/lib/supabase/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function PosTerminal() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosSearchResult[]>([]);
  const [items, setItems] = useState<LocalCartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const subtotal = computeSubtotal(items);
  const total = Math.max(subtotal - discount, 0);

  const handleSearch = () => {
    startSearch(async () => {
      const found = await searchProducts(query);
      setResults(found);
    });
  };

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
    startSubmit(async () => {
      const result = await registrarVenta(items, paymentMethod, discount);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">Buscar producto</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o SKU"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
          >
            {isSearching ? "Buscando..." : "Buscar"}
          </Button>
        </div>
        <div className="flex flex-col">
          {results.map((product) => (
            <ProductSearchResult key={product.id} product={product} onAdd={handleAdd} />
          ))}
          {results.length === 0 && query && !isSearching && (
            <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
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

        <div>
          <label htmlFor="paymentMethod" className="text-sm text-brand-ciruela">
            Método de pago
          </label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 border-t border-brand-rosa-claro pt-3 text-sm text-brand-ciruela">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{formatPrice(discount)}</span>
          </div>
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
          {isSubmitting ? "Registrando..." : "Registrar venta"}
        </Button>
      </div>
    </div>
  );
}
