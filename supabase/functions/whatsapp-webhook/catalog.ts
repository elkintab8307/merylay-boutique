import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

// Una fila por "unidad pedible": cada variante de un producto con
// variantes, o el producto base si no tiene ninguna. Incluye los ids
// reales (productId/variantId/imageId) para que el modelo pueda copiarlos
// tal cual del texto de resultados al pedir agregar_al_carrito.
export interface ProductoEncontrado {
  productId: string;
  variantId: string | null;
  nombre: string;
  talla: string | null;
  color: string | null;
  precio: number;
  stock: number;
  imageId: string | null;
  fotoUrl: string | null;
}

export interface ProductoParaCarrito {
  productId: string;
  variantId: string | null;
  nombre: string;
  precio: number;
  stock: number;
  imageId: string | null;
}

interface ImagenProducto {
  id: string;
  url: string;
  is_primary: boolean;
  variant_id: string | null;
  vendida: boolean | null;
}

interface VarianteProducto {
  id: string;
  talla: string | null;
  color: string | null;
  price_override: number | null;
  stock: number;
}

export interface FiltrosCatalogo {
  texto?: string;
  talla?: string;
  color?: string;
}

const TOPE_BUSCAR_CATALOGO = 50;

export async function buscarCatalogo(filtros: FiltrosCatalogo): Promise<ProductoEncontrado[]> {
  if (!filtros.texto && !filtros.talla && !filtros.color) {
    throw new Error("buscarCatalogo requiere al menos un filtro (texto, talla o color).");
  }

  const supabase = getSupabase();
  // product_variants!inner: cuando se filtra por talla/color, Postgres solo
  // devuelve las variantes que cumplen el filtro (no todas las del
  // producto) -- exactamente lo que se quiere expandir despues. Sin
  // talla/color no se usa !inner: un producto sin ninguna variante que
  // "coincida" (porque no se esta filtrando por variante) no debe excluirse.
  const variantesEmbed = (filtros.talla || filtros.color)
    ? "product_variants!inner(id, talla, color, price_override, stock)"
    : "product_variants(id, talla, color, price_override, stock)";

  let query = supabase
    .from("products")
    .select(`id, name, price, stock, categories(name), ${variantesEmbed}, product_images(id, url, is_primary, variant_id, vendida)`)
    .eq("is_active", true);

  if (filtros.talla) query = query.ilike("product_variants.talla", `%${escaparPatronLike(filtros.talla)}%`);
  if (filtros.color) query = query.ilike("product_variants.color", `%${escaparPatronLike(filtros.color)}%`);

  const { data, error } = await query;
  if (error || !data) return [];

  const productos = data as unknown as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    categories: { name: string } | null;
    product_variants: VarianteProducto[] | null;
    product_images: ImagenProducto[] | null;
  }>;

  // El texto se filtra en memoria (no en la consulta) porque PostgREST no
  // compone de forma simple un .or() entre una columna propia (name) y una
  // columna de una tabla relacionada (categories.name) dentro de la misma
  // llamada -- a esta escala de catalogo (decenas de productos activos) el
  // costo es insignificante.
  const textoNormalizado = filtros.texto?.toLowerCase();
  const filtrados = textoNormalizado
    ? productos.filter((p) =>
        p.name.toLowerCase().includes(textoNormalizado) ||
        (p.categories?.name ?? "").toLowerCase().includes(textoNormalizado))
    : productos;

  const expandido = filtrados.flatMap((producto): ProductoEncontrado[] => {
    const variantes = producto.product_variants ?? [];
    if (variantes.length === 0) {
      const imagen = elegirImagen(producto.product_images, null);
      return [{
        productId: producto.id,
        variantId: null,
        nombre: producto.name,
        talla: null,
        color: null,
        precio: producto.price,
        stock: producto.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      }];
    }
    return variantes.map((variante) => {
      const imagen = elegirImagen(producto.product_images, variante.id);
      return {
        productId: producto.id,
        variantId: variante.id,
        nombre: producto.name,
        talla: variante.talla ?? null,
        color: variante.color ?? null,
        precio: variante.price_override ?? producto.price,
        stock: variante.stock,
        imageId: imagen?.id ?? null,
        fotoUrl: imagen?.url ?? null,
      };
    });
  });

  return expandido.slice(0, TOPE_BUSCAR_CATALOGO);
}

// Elige la foto a mostrar/registrar para una variante (o para el producto
// base si variantId es null): primero las fotos propias de esa variante,
// luego las generales (variant_id null); dentro de cada grupo, la
// principal primero. Las fotos marcadas como `vendida` (estampado ya
// vendido) se descartan.
function elegirImagen(imagenes: ImagenProducto[] | null | undefined, variantId: string | null): ImagenProducto | null {
  const disponibles = (imagenes ?? []).filter((img) => !img.vendida);
  const deLaVariante = variantId ? disponibles.filter((img) => img.variant_id === variantId) : [];
  const generales = disponibles.filter((img) => img.variant_id === null);
  for (const grupo of [deLaVariante, generales]) {
    const elegida = grupo.find((img) => img.is_primary) ?? grupo[0];
    if (elegida) return elegida;
  }
  return null;
}

// Escapa los comodines de LIKE (% y _) y el propio caracter de escape (\)
// para que una busqueda con esos caracteres los trate como literales.
function escaparPatronLike(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Fuente de verdad para agregar al carrito: nunca se confia en el
// nombre/precio que mande el modelo. Devuelve null si el producto no
// existe o no esta activo, si la variante no pertenece a ese producto, o
// si se pide el producto base de un producto que si tiene variantes
// (en ese caso hay que elegir una variante concreta).
export async function obtenerProductoParaCarrito(
  productId: string,
  variantId: string | null,
): Promise<ProductoParaCarrito | null> {
  const supabase = getSupabase();
  const { data: producto, error } = await supabase
    .from("products")
    .select("id, name, price, stock, product_variants(id), product_images(id, url, is_primary, variant_id, vendida)")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !producto) return null;
  const p = producto as unknown as {
    id: string;
    name: string;
    price: number;
    stock: number;
    product_variants: { id: string }[] | null;
    product_images: ImagenProducto[] | null;
  };

  if (!variantId) {
    if ((p.product_variants ?? []).length > 0) return null;
    return {
      productId: p.id,
      variantId: null,
      nombre: p.name,
      precio: p.price,
      stock: p.stock,
      // imageId siempre null: este bot de WhatsApp no deja al cliente elegir
      // un estampado/foto especifico (ver migraciones 046/048). Un image_id
      // no nulo en order_items hace que el trigger de confirmacion de Wompi
      // solo marque esa foto como vendida y se salte el descuento normal de
      // stock del producto/variante.
      imageId: null,
    };
  }

  const { data: variante, error: errorVariante } = await supabase
    .from("product_variants")
    .select("id, name, price_override, stock, product_id")
    .eq("id", variantId)
    .eq("product_id", productId)
    .maybeSingle();

  if (errorVariante || !variante) return null;
  const v = variante as { id: string; name: string; price_override: number | null; stock: number; product_id: string };
  if (v.product_id !== p.id) return null;

  return {
    productId: p.id,
    variantId: v.id,
    nombre: `${p.name} (${v.name})`,
    precio: v.price_override ?? p.price,
    stock: v.stock,
    // imageId siempre null: ver comentario arriba en la rama sin variante.
    imageId: null,
  };
}

export interface FilaPdf {
  fotoUrl: string | null;
  nombre: string;
  detalle: string;
  precio: number;
  nota?: string;
}

const ALTO_FILA_PDF = 70;

export async function generarPdfConFotos(titulo: string, filas: FilaPdf[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([450, 140 + filas.length * ALTO_FILA_PDF]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuente });
  y -= 35;

  for (const fila of filas) {
    let anchoTexto = 20;
    if (fila.fotoUrl) {
      try {
        const bytes = await fetch(fila.fotoUrl).then((r) => {
          if (!r.ok) throw new Error(`descarga respondio ${r.status}`);
          return r.arrayBuffer();
        });
        const imagen = fila.fotoUrl.toLowerCase().endsWith(".png")
          ? await pdf.embedPng(bytes)
          : await pdf.embedJpg(bytes);
        const alto = 50;
        const ancho = (imagen.width / imagen.height) * alto;
        pagina.drawImage(imagen, { x: 20, y: y - alto + 10, width: ancho, height: alto });
        anchoTexto = 20 + ancho + 15;
      } catch (error) {
        console.error(`[catalog] No se pudo incrustar la foto de "${fila.nombre}" en el PDF:`, error);
      }
    }
    pagina.drawText(fila.nombre, { x: anchoTexto, y, size: 12, font: fuente });
    pagina.drawText(
      `${fila.detalle} — $${fila.precio.toLocaleString("es-CO")}${fila.nota ? ` — ${fila.nota}` : ""}`,
      { x: anchoTexto, y: y - 18, size: 10, font: fuente },
    );
    y -= ALTO_FILA_PDF;
  }

  return pdf.save();
}

export async function subirYFirmar(bytes: Uint8Array, nombreArchivo: string): Promise<string> {
  const supabase = getSupabase();
  const ruta = `${crypto.randomUUID()}-${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from("whatsapp-docs")
    .upload(ruta, bytes, { contentType: "application/pdf" });
  if (errorSubida) {
    throw new Error(`No se pudo subir el PDF ${nombreArchivo}: ${errorSubida.message}`);
  }

  const { data, error } = await supabase.storage.from("whatsapp-docs").createSignedUrl(ruta, 600);
  if (error || !data) {
    throw new Error(`No se pudo firmar el link del PDF ${nombreArchivo}: ${error?.message}`);
  }

  return data.signedUrl;
}

export async function generarCatalogoPdf(filtros?: FiltrosCatalogo): Promise<string> {
  const productos = filtros
    ? await buscarCatalogo(filtros)
    : await (async () => {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from("products")
          .select("name, price, stock")
          .eq("is_active", true)
          .order("name");
        if (error) {
          throw new Error(`No se pudo consultar los productos para el catalogo: ${error.message}`);
        }
        return ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map((p) => ({
          productId: "", variantId: null, nombre: p.name, talla: null, color: null,
          precio: p.price, stock: p.stock, imageId: null, fotoUrl: null,
        }));
      })();

  const filas: FilaPdf[] = productos.map((p) => ({
    fotoUrl: p.fotoUrl,
    nombre: p.nombre,
    detalle: [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean).join(", ") || "—",
    precio: p.precio,
    nota: `stock: ${p.stock}`,
  }));

  const bytes = await generarPdfConFotos("Catalogo MeryLay Boutique", filas);
  return subirYFirmar(bytes, "catalogo.pdf");
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const filas: FilaPdf[] = items.map((item) => ({
    fotoUrl: null,
    nombre: item.nameSnapshot,
    detalle: `x${item.qty}`,
    precio: item.unitPrice * item.qty,
  }));
  const bytes = await generarPdfConFotos("Cotizacion MeryLay Boutique", filas);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
