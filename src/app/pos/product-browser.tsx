"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LayoutGrid, ScanBarcode } from "lucide-react";
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
  // Errores separados por flujo: la carga inicial (categorías/umbral) y la
  // búsqueda en vivo se disparan de forma independiente y no deben borrarse
  // entre sí — si uno falla, el otro sigue pudiendo limpiar/mostrar el suyo
  // sin descartar el mensaje del otro.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  useEffect(() => {
    listarCategoriasPos()
      .then(setCategorias)
      .catch((err) => {
        console.error("Error al cargar categorías:", err);
        setErrorCarga("No se pudieron cargar las categorías. Intenta de nuevo.");
      });
    obtenerUmbralStockBajoPos()
      .then(setUmbralStockBajo)
      .catch((err) => {
        console.error("Error al obtener umbral de stock bajo:", err);
        setErrorCarga("No se pudo obtener la configuración de stock. Intenta de nuevo.");
      });
  }, []);

  useEffect(() => {
    setCargando(true);
    setErrorBusqueda(null);
    let cancelled = false;
    const timeout = setTimeout(() => {
      buscarProductosPos({ query, categoryId })
        .then((resultado) => {
          if (cancelled) return;
          setProductos(resultado);
          setCargando(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("Error al buscar productos:", err);
          setErrorBusqueda("No se pudieron cargar los productos. Intenta de nuevo.");
          setCargando(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, categoryId]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
      <h2 className="font-heading text-xl text-brand-ciruela">Productos</h2>

      <div role="group" aria-label="Categorías" className="flex gap-3 overflow-x-auto pb-1 md:hidden">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          aria-pressed={categoryId === null}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 bg-brand-rosa-claro ${
              categoryId === null ? "border-brand-rosa" : "border-transparent"
            }`}
          >
            <LayoutGrid className="h-6 w-6 text-brand-ciruela" />
          </span>
          <span className="text-xs text-brand-ciruela">Todos</span>
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryId(cat.id)}
            aria-pressed={categoryId === cat.id}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <span
              className={`relative h-14 w-14 overflow-hidden rounded-full border-2 bg-brand-rosa-claro ${
                categoryId === cat.id ? "border-brand-rosa" : "border-transparent"
              }`}
            >
              {cat.imageUrl && (
                <Image src={cat.imageUrl} alt={cat.name} fill className="object-cover" />
              )}
            </span>
            <span className="max-w-[4rem] truncate text-xs text-brand-ciruela">{cat.name}</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Categorías" className="hidden flex-wrap gap-2 md:flex">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          aria-pressed={categoryId === null}
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
            aria-pressed={categoryId === cat.id}
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

      {errorCarga && (
        <p className="text-sm text-red-600">{errorCarga}</p>
      )}
      {errorBusqueda && (
        <p className="text-sm text-red-600">{errorBusqueda}</p>
      )}

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
      {(query || categoryId) && !cargando && productos.length === 0 && (
        <p className="text-sm text-brand-ciruela/60">Sin resultados.</p>
      )}
    </div>
  );
}
