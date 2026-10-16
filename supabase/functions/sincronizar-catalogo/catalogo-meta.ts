import type { SupabaseClient } from "@supabase/supabase-js";

type Supabase = SupabaseClient;

interface ImagenFila {
  id: string;
  url: string;
  is_primary: boolean;
  variant_id: string | null;
  vendida: boolean | null;
}

interface VarianteFila {
  id: string;
  sku: string;
  talla: string | null;
  color: string | null;
  price_override: number | null;
  stock: number;
}

interface ProductoFila {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  product_variants: VarianteFila[] | null;
  product_images: ImagenFila[] | null;
}

export interface ItemCatalogo {
  method: "UPDATE";
  data: {
    id: string;
    title: string;
    description: string;
    availability: "in stock" | "out of stock";
    condition: "new";
    price: string;
    link: string;
    image_link: string;
    brand: string;
  };
}

const MARCA = "MeryLay Boutique";

// Misma logica de seleccion de foto que whatsapp-webhook/catalog.ts
// (elegirImagen): primero fotos propias de la variante, luego las
// generales; dentro de cada grupo, la principal primero. Duplicada aqui
// porque esta es una Edge Function separada (no comparte modulos con
// whatsapp-webhook mas alla de _shared/).
function elegirImagen(imagenes: ImagenFila[] | null | undefined, variantId: string | null): ImagenFila | null {
  const disponibles = (imagenes ?? []).filter((img) => !img.vendida);
  const deLaVariante = variantId ? disponibles.filter((img) => img.variant_id === variantId) : [];
  const generales = disponibles.filter((img) => img.variant_id === null);
  for (const grupo of [deLaVariante, generales]) {
    const elegida = grupo.find((img) => img.is_primary) ?? grupo[0];
    if (elegida) return elegida;
  }
  return null;
}

// Meta exige el precio como "<monto> <ISO 4217>"; COP no usa decimales.
function formatoPrecioMeta(precio: number): string {
  return `${Math.round(precio)} COP`;
}

export async function construirItemsCatalogo(supabase: Supabase): Promise<ItemCatalogo[]> {
  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) throw new Error("Falta SITE_URL.");

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, description, slug, sku, price, stock, product_variants(id, sku, talla, color, price_override, stock), product_images(id, url, is_primary, variant_id, vendida)",
    )
    .eq("is_active", true);
  if (error || !data) return [];

  const productos = data as unknown as ProductoFila[];

  return productos.flatMap((producto): ItemCatalogo[] => {
    const variantes = producto.product_variants ?? [];
    const descripcion = producto.description || producto.name;
    const link = `${siteUrl}/producto/${producto.slug}`;

    if (variantes.length === 0) {
      const imagen = elegirImagen(producto.product_images, null);
      // Meta rechaza items sin image_link: mejor omitirlo que mandar un
      // item invalido que haga fallar todo el lote.
      if (!imagen) return [];
      return [
        {
          method: "UPDATE",
          data: {
            id: producto.sku,
            title: producto.name,
            description: descripcion,
            availability: producto.stock > 0 ? "in stock" : "out of stock",
            condition: "new",
            price: formatoPrecioMeta(producto.price),
            link,
            image_link: imagen.url,
            brand: MARCA,
          },
        },
      ];
    }

    return variantes.flatMap((variante): ItemCatalogo[] => {
      const imagen = elegirImagen(producto.product_images, variante.id);
      if (!imagen) return [];
      const detalle = [variante.talla, variante.color].filter(Boolean).join(" ");
      return [
        {
          method: "UPDATE",
          data: {
            id: variante.sku,
            title: detalle ? `${producto.name} (${detalle})` : producto.name,
            description: descripcion,
            availability: variante.stock > 0 ? "in stock" : "out of stock",
            condition: "new",
            price: formatoPrecioMeta(variante.price_override ?? producto.price),
            link,
            image_link: imagen.url,
            brand: MARCA,
          },
        },
      ];
    });
  });
}

const TAMANO_LOTE = 500;

export async function enviarItemsBatch(items: ItemCatalogo[]): Promise<{ enviados: number; errores: string[] }> {
  if (items.length === 0) return { enviados: 0, errores: [] };

  const token = Deno.env.get("META_CATALOG_ACCESS_TOKEN");
  const catalogId = Deno.env.get("META_CATALOG_ID");
  if (!token || !catalogId) {
    throw new Error("Faltan META_CATALOG_ACCESS_TOKEN o META_CATALOG_ID.");
  }

  const errores: string[] = [];
  let enviados = 0;

  for (let i = 0; i < items.length; i += TAMANO_LOTE) {
    const lote = items.slice(i, i + TAMANO_LOTE);
    const respuesta = await fetch(`https://graph.facebook.com/v21.0/${catalogId}/items_batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item_type: "PRODUCT_ITEM", requests: lote }),
    });
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      errores.push(`Lote ${i}-${i + lote.length}: Graph API respondio ${respuesta.status}: ${cuerpo}`);
      continue;
    }
    enviados += lote.length;
  }

  return { enviados, errores };
}
