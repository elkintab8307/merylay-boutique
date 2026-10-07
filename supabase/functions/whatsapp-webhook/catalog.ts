import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

export interface ProductoEncontrado {
  id: string;
  nombre: string;
  precio: number;
  stock: number;
  fotoUrl: string | null;
}

export async function buscarProductos(consulta: string): Promise<ProductoEncontrado[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, stock, product_images(url, is_primary)")
    .eq("is_active", true)
    .ilike("name", `%${consulta}%`)
    .limit(10);

  if (error || !data) return [];

  return (data as Array<{
    id: string;
    name: string;
    price: number;
    stock: number;
    product_images: { url: string; is_primary: boolean }[];
  }>).map((producto) => ({
    id: producto.id,
    nombre: producto.name,
    precio: producto.price,
    stock: producto.stock,
    fotoUrl: producto.product_images.find((img) => img.is_primary)?.url ?? producto.product_images[0]?.url ?? null,
  }));
}

async function pdfDesdeLineas(titulo: string, lineas: string[], total: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage([400, 120 + lineas.length * 20]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuente });
  y -= 30;
  for (const linea of lineas) {
    pagina.drawText(linea, { x: 20, y, size: 11, font: fuente });
    y -= 20;
  }
  pagina.drawText(`Total: $${total.toLocaleString("es-CO")}`, { x: 20, y: y - 10, size: 13, font: fuente });
  return pdf.save();
}

async function subirYFirmar(bytes: Uint8Array, nombreArchivo: string): Promise<string> {
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

export async function generarCatalogoPdf(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("products")
    .select("name, price, stock")
    .eq("is_active", true)
    .order("name");

  const lineas = ((data ?? []) as Array<{ name: string; price: number; stock: number }>).map(
    (p) => `${p.name} — $${p.price.toLocaleString("es-CO")} (stock: ${p.stock})`,
  );
  const bytes = await pdfDesdeLineas("Catalogo MeryLay Boutique", lineas, 0);
  return subirYFirmar(bytes, "catalogo.pdf");
}

export async function generarCotizacionPdf(items: ItemCarrito[]): Promise<string> {
  const lineas = items.map(
    (item) => `${item.nameSnapshot} x${item.qty} — $${(item.unitPrice * item.qty).toLocaleString("es-CO")}`,
  );
  const total = items.reduce((suma, item) => suma + item.unitPrice * item.qty, 0);
  const bytes = await pdfDesdeLineas("Cotizacion MeryLay Boutique", lineas, total);
  return subirYFirmar(bytes, "cotizacion.pdf");
}
