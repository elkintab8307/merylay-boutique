"use client";

import { useState } from "react";
import { Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";
import { ProductRatingSummary } from "@/components/store/product-rating-summary";
import { ShareButton } from "@/components/store/share-button";
import { WhatsappProductButton } from "@/components/store/whatsapp-product-button";
import { findMatchingVariant, type VariantOption } from "@/lib/store/variants";
import { getImagesForVariant, type ImagenProducto } from "@/lib/store/variant-images";
import type { EstampadoOption } from "@/components/store/estampado-picker-modal";

export function ProductDetailInteractive({
  productId,
  productSlug,
  productName,
  description,
  price,
  promoPrice,
  images,
  variants,
  baseStock,
  currentUserId,
  initialFavorite,
  imagenPrincipal,
  promedioCalificacion,
  totalCalificaciones,
  redesWhatsapp,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  description: string | null;
  price: number;
  promoPrice: number | null;
  images: ImagenProducto[];
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
  initialFavorite: boolean;
  imagenPrincipal: string | null;
  promedioCalificacion: number;
  totalCalificaciones: number;
  redesWhatsapp: string | null;
}) {
  const [talla, setTalla] = useState<string | null>(variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(variants[0]?.color ?? null);

  const variantSeleccionada =
    variants.length > 0 ? findMatchingVariant(variants, talla, color) : null;
  const imagenesGaleria = getImagesForVariant(images, variantSeleccionada?.id ?? null);
  const imagenesDeVarianteActual: EstampadoOption[] = variantSeleccionada
    ? images
        .filter((img) => img.variantId === variantSeleccionada.id && !img.vendida)
        .map((img) => ({ imageId: img.id, url: img.url, alt: img.alt }))
    : [];
  const descuento = calcularDescuento(price, promoPrice);
  const precioMostrado = precioEfectivo(price, promoPrice);

  const handleSelectVariant = (variantId: string | null) => {
    if (!variantId) return;
    const variante = variants.find((v) => v.id === variantId);
    if (!variante) return;
    setTalla(variante.talla);
    setColor(variante.color);
  };

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <ProductGallery
        images={imagenesGaleria}
        productName={productName}
        selectedVariantId={variantSeleccionada?.id ?? null}
        onSelectVariant={handleSelectVariant}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-3xl text-brand-ciruela">{productName}</h1>
          <FavoriteButton
            productId={productId}
            currentUserId={currentUserId}
            initialFavorite={initialFavorite}
            product={{
              slug: productSlug,
              name: productName,
              price: precioMostrado,
              imageUrl: imagenPrincipal,
            }}
          />
        </div>
        <ProductRatingSummary promedio={promedioCalificacion} total={totalCalificaciones} />
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-2xl text-brand-rosa">
            {formatPrice(precioMostrado)}
          </span>
          {descuento !== null && (
            <span className="text-brand-ciruela/50 line-through">{formatPrice(price)}</span>
          )}
        </div>
        {description && <p className="text-brand-ciruela/80">{description}</p>}
        <ProductVariantSelector
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          imageUrl={imagenPrincipal}
          basePrice={precioMostrado}
          variants={variants}
          baseStock={baseStock}
          currentUserId={currentUserId}
          talla={talla}
          color={color}
          onTallaChange={setTalla}
          onColorChange={setColor}
          imagenesDeVarianteActual={imagenesDeVarianteActual}
        />
        <div className="flex flex-wrap items-center gap-3">
          <WhatsappProductButton redesWhatsapp={redesWhatsapp} productName={productName} />
          <ShareButton productName={productName} />
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-brand-rosa-claro pt-4 text-xs text-brand-ciruela/70">
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-brand-rosa" />
            Envío a toda Colombia
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-brand-rosa" />
            Pago seguro
          </span>
          <span className="flex items-center gap-1.5">
            <RefreshCw className="h-4 w-4 text-brand-rosa" />
            Cambios y devoluciones
          </span>
        </div>
      </div>
    </div>
  );
}
