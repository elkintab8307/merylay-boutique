"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { productoAgotado } from "@/lib/store/stock";
import {
  getLocalFavorites,
  saveLocalFavorites,
  toggleLocalFavorite,
  type LocalFavoriteItem,
} from "@/lib/favorites/local-favorites";
import { getLocalCart, saveLocalCart, mergeCartItem } from "@/lib/cart/local-cart";

export function GuestFavorites() {
  const [items, setItems] = useState<LocalFavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [productosConVariantes, setProductosConVariantes] = useState<Set<string>>(new Set());
  const [productosAgotados, setProductosAgotados] = useState<Set<string>>(new Set());

  useEffect(() => {
    const localItems = getLocalFavorites();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(localItems);
    setLoaded(true);

    if (localItems.length === 0) return;
    const supabase = createClient();
    const productIds = localItems.map((i) => i.productId);

    supabase
      .from("product_variants")
      .select("product_id")
      .in("product_id", productIds)
      .then(({ data }) => {
        setProductosConVariantes(new Set((data ?? []).map((v) => v.product_id)));
      });

    Promise.all([
      supabase.from("products").select("id, stock").in("id", productIds),
      supabase.from("product_variants").select("product_id, stock").in("product_id", productIds),
    ]).then(([{ data: productos }, { data: variantes }]) => {
      const stocksVariantesPorProducto = new Map<string, number[]>();
      for (const v of variantes ?? []) {
        const actuales = stocksVariantesPorProducto.get(v.product_id) ?? [];
        actuales.push(v.stock);
        stocksVariantesPorProducto.set(v.product_id, actuales);
      }
      const agotados = new Set(
        (productos ?? [])
          .filter((p) => productoAgotado(p.stock, stocksVariantesPorProducto.get(p.id) ?? []))
          .map((p) => p.id),
      );
      setProductosAgotados(agotados);
    });
  }, []);

  const handleRemove = (item: LocalFavoriteItem) => {
    const next = toggleLocalFavorite(items, item);
    setItems(next);
    saveLocalFavorites(next);
  };

  const handleAddToCart = (item: LocalFavoriteItem) => {
    const current = getLocalCart();
    // El stock real se valida en el checkout (RPC atomica del servidor);
    // aqui no se conoce el stock del producto porque no se guarda al
    // marcarlo como favorito, asi que no se limita la cantidad local.
    const next = mergeCartItem(current, {
      productId: item.productId,
      variantId: null,
      imageId: null,
      slug: item.slug,
      name: item.name,
      unitPrice: item.price,
      qty: 1,
      imageUrl: item.imageUrl,
      stock: Number.MAX_SAFE_INTEGER,
    });
    saveLocalCart(next);
    setMessage("Agregado al carrito.");
  };

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Aún no tienes productos favoritos.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <p className="text-sm text-brand-oro">{message}</p>}
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-4 py-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
              )}
            </div>
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              <p className="text-sm text-brand-rosa">{formatPrice(item.price)}</p>
              {productosAgotados.has(item.productId) && (
                <div className="mt-1">
                  <Badge variant="danger">Agotado</Badge>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {productosConVariantes.has(item.productId) ? (
                <Link
                  href={`/producto/${item.slug}`}
                  className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
                >
                  Ver producto
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleAddToCart(item)}
                  className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
                >
                  Agregar al carrito
                </button>
              )}
              <button
                type="button"
                onClick={() => handleRemove(item)}
                className="text-sm text-red-600 hover:underline"
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
