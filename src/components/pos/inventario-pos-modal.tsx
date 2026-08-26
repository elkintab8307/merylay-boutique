"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { ProductoForm } from "@/app/admin/productos/producto-form";
import { toggleProductoActivo, eliminarProducto } from "@/app/admin/productos/actions";
import {
  listarProductosInventario,
  obtenerProductoParaEditar,
  type InventarioProductoResumen,
  type InventarioCategoria,
  type InventarioProductoParaEditar,
} from "@/app/pos/inventario-actions";

type Vista =
  | { tipo: "lista" }
  | { tipo: "nuevo" }
  | { tipo: "editar"; producto: InventarioProductoParaEditar };

export function InventarioPosModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [cargando, setCargando] = useState(false);
  const [productos, setProductos] = useState<InventarioProductoResumen[]>([]);
  const [categorias, setCategorias] = useState<InventarioCategoria[]>([]);
  const [umbralStockBajo, setUmbralStockBajo] = useState(5);
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [error, setError] = useState<string | null>(null);

  const cargarLista = async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await listarProductosInventario();
      setProductos(data.productos);
      setCategorias(data.categorias);
      setUmbralStockBajo(data.umbralStockBajo);
    } catch {
      setError("No se pudo cargar el inventario.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // El modal se reutiliza sin desmontarse entre aperturas: recarga la
    // lista y vuelve a la vista inicial cada vez que se abre de nuevo.
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVista({ tipo: "lista" });
      cargarLista();
    }
  }, [open]);

  const handleEditar = async (id: string) => {
    setCargando(true);
    setError(null);
    const resultado = await obtenerProductoParaEditar(id);
    setCargando(false);
    if (resultado.error || !resultado.producto) {
      setError(resultado.error ?? "No se pudo cargar el producto.");
      return;
    }
    setVista({ tipo: "editar", producto: resultado.producto });
  };

  const handleToggleActivo = async (producto: InventarioProductoResumen) => {
    await toggleProductoActivo(producto.id, !producto.isActive);
    setProductos((prev) =>
      prev.map((p) => (p.id === producto.id ? { ...p, isActive: !p.isActive } : p)),
    );
  };

  const handleEliminar = async (producto: InventarioProductoResumen) => {
    if (!window.confirm(`¿Eliminar "${producto.name}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    const resultado = await eliminarProducto(producto.id);
    if (resultado?.error) {
      setError(resultado.error);
      return;
    }
    setProductos((prev) => prev.filter((p) => p.id !== producto.id));
  };

  const handleGuardado = () => {
    setVista({ tipo: "lista" });
    cargarLista();
  };

  const titulo =
    vista.tipo === "lista"
      ? "Inventario"
      : vista.tipo === "nuevo"
        ? "Nuevo producto"
        : "Editar producto";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col overflow-hidden">
        <SheetHeader>
          <SheetTitle className="font-heading text-brand-ciruela">{titulo}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {vista.tipo === "lista" && (
            <>
              <div className="mb-4 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setVista({ tipo: "nuevo" })}
                  className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
                >
                  Nuevo producto
                </Button>
              </div>
              {cargando ? (
                <p className="text-sm text-brand-ciruela/70">Cargando...</p>
              ) : productos.length === 0 ? (
                <p className="text-sm text-brand-ciruela/70">No hay productos registrados.</p>
              ) : (
                <div className="flex flex-col gap-3 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {productos.map((producto) => {
                    const stockBadge =
                      producto.stock === 0
                        ? { variant: "danger" as const, label: "Agotado" }
                        : producto.stock <= umbralStockBajo
                          ? { variant: "warning" as const, label: `${producto.stock} unidades` }
                          : { variant: "neutral" as const, label: `${producto.stock} unidades` };
                    const descuento = calcularDescuento(producto.price, producto.promoPrice);
                    const precioMostrado = precioEfectivo(producto.price, producto.promoPrice);

                    return (
                      <div
                        key={producto.id}
                        className="flex gap-3 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm sm:flex-col sm:gap-0 sm:overflow-hidden sm:p-0"
                      >
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro sm:aspect-square sm:h-auto sm:w-full sm:rounded-none">
                          {producto.imageUrl && (
                            <Image
                              src={producto.imageUrl}
                              alt={producto.name}
                              fill
                              className="object-contain"
                              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 64px"
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 sm:p-3">
                          <p className="font-heading text-sm text-brand-ciruela">
                            {producto.name}
                          </p>
                          <p className="text-xs text-brand-ciruela/60">
                            {producto.sku}
                            {producto.categoryName ? ` · ${producto.categoryName}` : ""}
                          </p>
                          <div className="flex items-baseline gap-2">
                            <p className="font-heading text-brand-rosa">
                              {formatPrice(precioMostrado)}
                            </p>
                            {descuento !== null && (
                              <p className="text-xs text-brand-ciruela/50 line-through">
                                {formatPrice(producto.price)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
                            <Badge variant={producto.isActive ? "success" : "neutral"}>
                              {producto.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>
                          <div className="mt-auto flex items-center gap-3 pt-1 text-xs">
                            <button
                              type="button"
                              onClick={() => handleEditar(producto.id)}
                              className="text-brand-rosa hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(producto)}
                              className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
                            >
                              {producto.isActive ? "Desactivar" : "Activar"}
                            </button>
                            {!producto.tieneVentas && (
                              <button
                                type="button"
                                onClick={() => handleEliminar(producto)}
                                className="text-red-600 hover:underline"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {(vista.tipo === "nuevo" || vista.tipo === "editar") && (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setVista({ tipo: "lista" })}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al inventario
              </button>
              {vista.tipo === "nuevo" ? (
                <ProductoForm
                  defaultValues={{
                    name: "",
                    slug: "",
                    description: "",
                    categoryId: null,
                    price: 0,
                    promoPrice: null,
                    costPrice: null,
                    stock: 0,
                    isActive: true,
                    isFeatured: false,
                    variantes: [{ talla: "", color: "", priceOverride: null }],
                  }}
                  categoriasDisponibles={categorias}
                  onGuardado={handleGuardado}
                />
              ) : (
                <ProductoForm
                  productoId={vista.producto.productoId}
                  skuActual={vista.producto.skuActual}
                  codigoBarras={vista.producto.codigoBarras}
                  codigoQr={vista.producto.codigoQr}
                  defaultValues={vista.producto.defaultValues}
                  categoriasDisponibles={categorias}
                  imagenesExistentes={vista.producto.imagenesExistentes}
                  onGuardado={handleGuardado}
                />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
