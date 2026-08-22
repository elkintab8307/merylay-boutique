"use client";

import { useEffect, useState } from "react";
import { ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  buscarProductosPos,
  listarCategoriasPos,
  obtenerUmbralStockBajoPos,
  type PosProductoResult,
  type PosCategoriaResult,
} from "./product-browser-action";
import { ProductCardPos } from "./product-card-pos";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export function ProductBrowser({ onAdd }: { onAdd: (item: LocalCartItem) => void }) {
  const [categorias, setCategorias] = useState<PosCategoriaResult[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [productos, setProductos] = useState<PosProductoResult[]>([]);
  const [umbralStockBajo, setUmbralStockBajo] = useState(5);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    listarCategoriasPos().then(setCategorias);
    obtenerUmbralStockBajoPos().then(setUmbralStockBajo);
  }, []);

  useEffect(() => {
    setCargando(true);
    const timeout = setTimeout(() => {
      buscarProductosPos({ query, categoryId }).then((resultado) => {
        setProductos(resultado);
        setCargando(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, categoryId]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
      <h2 className="font-heading text-xl text-brand-ciruela">Productos</h2>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`rounded-full border px-3 py-1 text-sm ${
            categoryId === null
              ? "border-brand-rosa bg-brand-rosa text-brand-crema"
              : "border-brand-rosa-claro text-brand-ciruela"
          }`}
        >
          Todos
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              categoryId === cat.id
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre o SKU"
        />
        <button
          type="button"
          disabled
          title="Próximamente"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-2 text-sm text-brand-ciruela/50 opacity-50"
        >
          <ScanBarcode className="h-4 w-4" />
          Scanner
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {productos.map((product) => (
          <ProductCardPos
            key={product.id}
            product={product}
            umbralStockBajo={umbralStockBajo}
            onAdd={onAdd}
          />
        ))}
      </div>
      {!cargando && productos.length === 0 && (
        <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
      )}
    </div>
  );
}
