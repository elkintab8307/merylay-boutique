import { PDFDocument, StandardFonts } from "pdf-lib";
import { getSupabase } from "../_shared/db.ts";
import { subirYFirmar } from "./catalog.ts";
import { ESTADOS_PEDIDO_VENDIDO, formatoMoneda, type RespuestaLectura } from "./owner-actions.ts";

const TOPE_FILAS_PDF_DETALLE = 200;

async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const altoFila = 20;
  const anchoPagina = 550;
  const pagina = pdf.addPage([anchoPagina, 120 + (filas.length + 1) * altoFila]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteTitulo = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = pagina.getHeight() - 40;
  pagina.drawText(titulo, { x: 20, y, size: 16, font: fuenteTitulo });
  y -= 30;

  const anchoColumna = (anchoPagina - 40) / encabezados.length;
  encabezados.forEach((encabezado, i) => {
    pagina.drawText(encabezado, { x: 20 + i * anchoColumna, y, size: 10, font: fuenteTitulo });
  });
  y -= altoFila;

  for (const fila of filas) {
    fila.forEach((valor, i) => {
      pagina.drawText(valor, { x: 20 + i * anchoColumna, y, size: 9, font: fuente });
    });
    y -= altoFila;
  }

  return pdf.save();
}

export async function informeVentas(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [pedidos, ventasPos] = await Promise.all([
    supabase.from("orders").select("total, channel, payment_method, created_at").gte("created_at", desde).in("status", ESTADOS_PEDIDO_VENDIDO),
    supabase.from("pos_sales").select("total, payment_method, created_at").gte("created_at", desde),
  ]);
  if (pedidos.error) throw new Error(`No se pudieron consultar los pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudieron consultar las ventas POS: ${ventasPos.error.message}`);

  const filasPedidos = (pedidos.data ?? []) as { total: number; channel: string; payment_method: string | null; created_at: string }[];
  const filasPos = (ventasPos.data ?? []) as { total: number; payment_method: string; created_at: string }[];

  if (filasPedidos.length === 0 && filasPos.length === 0) {
    return { texto: `No hubo ventas en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const totalPedidos = filasPedidos.reduce((suma, p) => suma + Number(p.total), 0);
  const totalPos = filasPos.reduce((suma, v) => suma + Number(v.total), 0);

  const porCanal = new Map<string, number>();
  for (const p of filasPedidos) porCanal.set(p.channel, (porCanal.get(p.channel) ?? 0) + Number(p.total));
  if (totalPos > 0 || filasPos.length > 0) porCanal.set("pos", (porCanal.get("pos") ?? 0) + totalPos);

  const porMetodo = new Map<string, number>();
  for (const p of filasPedidos) {
    const metodo = p.payment_method ?? "wompi";
    porMetodo.set(metodo, (porMetodo.get(metodo) ?? 0) + Number(p.total));
  }
  for (const v of filasPos) porMetodo.set(v.payment_method, (porMetodo.get(v.payment_method) ?? 0) + Number(v.total));

  const lineaCanal = [...porCanal.entries()].map(([canal, total]) => `${canal}: ${formatoMoneda(total)}`).join(", ");
  const lineaMetodo = [...porMetodo.entries()].map(([metodo, total]) => `${metodo}: ${formatoMoneda(total)}`).join(", ");

  const texto = `Ventas de los últimos ${dias} día(s): ${formatoMoneda(totalPedidos + totalPos)}.\n` +
    `Por canal: ${lineaCanal}.\n` +
    `Por método de pago: ${lineaMetodo}.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const combinadas = [
    ...filasPedidos.map((p) => ({ fecha: p.created_at, canal: p.channel, metodo: p.payment_method ?? "wompi", total: Number(p.total) })),
    ...filasPos.map((v) => ({ fecha: v.created_at, canal: "pos", metodo: v.payment_method, total: Number(v.total) })),
  ].sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  const filasTabla = combinadas.slice(0, TOPE_FILAS_PDF_DETALLE).map((f) => [
    new Date(f.fecha).toLocaleDateString("es-CO"),
    f.canal,
    f.metodo,
    formatoMoneda(f.total),
  ]);

  const bytes = await generarPdfTabla(`Informe de ventas — últimos ${dias} día(s)`, ["Fecha", "Canal", "Método", "Total"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-ventas.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-ventas-merylay.pdf" }] };
}

const TOPE_FILAS_PDF_RANKING = 50;

export async function productosMasVendidos(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [itemsPedidos, itemsPos] = await Promise.all([
    supabase
      .from("order_items")
      .select("product_id, qty, line_total, orders!inner(status, created_at)")
      .gte("orders.created_at", desde)
      .in("orders.status", ESTADOS_PEDIDO_VENDIDO),
    supabase
      .from("pos_sale_items")
      .select("product_id, qty, line_total, pos_sales!inner(created_at)")
      .gte("pos_sales.created_at", desde),
  ]);
  if (itemsPedidos.error) throw new Error(`No se pudieron consultar los items de pedidos: ${itemsPedidos.error.message}`);
  if (itemsPos.error) throw new Error(`No se pudieron consultar los items de ventas POS: ${itemsPos.error.message}`);

  const filasPedidos = (itemsPedidos.data ?? []) as { product_id: string | null; qty: number; line_total: number }[];
  const filasPos = (itemsPos.data ?? []) as { product_id: string | null; qty: number; line_total: number }[];

  const acumulado = new Map<string, { qty: number; ingresos: number }>();
  for (const fila of [...filasPedidos, ...filasPos]) {
    if (!fila.product_id) continue; // producto eliminado despues de la venta
    const actual = acumulado.get(fila.product_id) ?? { qty: 0, ingresos: 0 };
    actual.qty += fila.qty;
    actual.ingresos += Number(fila.line_total);
    acumulado.set(fila.product_id, actual);
  }

  if (acumulado.size === 0) {
    return { texto: `No hubo productos vendidos en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsProductos = [...acumulado.keys()];
  const { data: productos, error: errorProductos } = await supabase.from("products").select("id, name").in("id", idsProductos);
  if (errorProductos) throw new Error(`No se pudieron consultar los nombres de productos: ${errorProductos.message}`);
  const nombrePorId = new Map(((productos ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const ranking = idsProductos
    .map((id) => ({ nombre: nombrePorId.get(id) ?? "(producto eliminado)", ...acumulado.get(id)! }))
    .sort((a, b) => b.qty - a.qty);

  const textoTabla = ranking.slice(0, limite).map((p, i) => `${i + 1}. ${p.nombre} — ${p.qty} unidad(es), ${formatoMoneda(p.ingresos)}`).join("\n");
  const texto = `Productos más vendidos en los últimos ${dias} día(s):\n${textoTabla}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ranking.slice(0, TOPE_FILAS_PDF_RANKING).map((p) => [p.nombre, String(p.qty), formatoMoneda(p.ingresos)]);
  const bytes = await generarPdfTabla(`Productos más vendidos — últimos ${dias} día(s)`, ["Producto", "Unidades", "Ingresos"], filasTabla);
  const link = await subirYFirmar(bytes, "productos-mas-vendidos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "productos-mas-vendidos-merylay.pdf" }] };
}

export async function informeClientes(dias: number, limite: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const [pedidos, ventasPos, clientesPos] = await Promise.all([
    supabase.from("orders").select("user_id, total").gte("created_at", desde).in("status", ESTADOS_PEDIDO_VENDIDO),
    supabase.from("pos_sales").select("customer_id, total").gte("created_at", desde),
    supabase.from("pos_customers").select("id, profile_id, nombre"),
  ]);
  if (pedidos.error) throw new Error(`No se pudieron consultar los pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudieron consultar las ventas POS: ${ventasPos.error.message}`);
  if (clientesPos.error) throw new Error(`No se pudieron consultar los clientes de POS: ${clientesPos.error.message}`);

  const filasPedidos = (pedidos.data ?? []) as { user_id: string; total: number }[];
  const filasPos = (ventasPos.data ?? []) as { customer_id: string | null; total: number }[];
  const posCustomers = (clientesPos.data ?? []) as { id: string; profile_id: string | null; nombre: string }[];
  const posCustomerPorId = new Map(posCustomers.map((c) => [c.id, c]));

  // Clave de agrupacion: profile_id cuando existe (web/whatsapp, o POS
  // vinculado a un perfil) -- asi un cliente que compra por ambos canales
  // suma en UNA sola fila. Si un pos_customer no tiene profile_id, se usa
  // su propio id como clave (cliente solo-POS).
  const acumulado = new Map<string, { total: number; compras: number; nombrePos?: string }>();

  for (const p of filasPedidos) {
    const actual = acumulado.get(p.user_id) ?? { total: 0, compras: 0 };
    actual.total += Number(p.total);
    actual.compras += 1;
    acumulado.set(p.user_id, actual);
  }

  for (const v of filasPos) {
    if (!v.customer_id) continue; // venta de mostrador sin cliente identificado
    const posCustomer = posCustomerPorId.get(v.customer_id);
    const clave = posCustomer?.profile_id ?? v.customer_id;
    // nombrePos solo aplica a clientes solo-POS (sin profile_id vinculado):
    // si hay profile_id, el nombre debe salir de `profiles` mas abajo, para
    // que un cliente fusionado muestre su nombre de perfil, no el nombre
    // (potencialmente distinto) con el que quedo registrado en el POS.
    const nombrePosSoloSiNoVinculado = posCustomer?.profile_id ? undefined : posCustomer?.nombre;
    const actual = acumulado.get(clave) ?? { total: 0, compras: 0, nombrePos: nombrePosSoloSiNoVinculado };
    actual.total += Number(v.total);
    actual.compras += 1;
    if (!actual.nombrePos) actual.nombrePos = nombrePosSoloSiNoVinculado;
    acumulado.set(clave, actual);
  }

  if (acumulado.size === 0) {
    return { texto: `No hubo clientes identificados con compras en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const clavesSinNombrePos = [...acumulado.entries()].filter(([, v]) => !v.nombrePos).map(([clave]) => clave);
  const { data: perfiles, error: errorPerfiles } = clavesSinNombrePos.length > 0
    ? await supabase.from("profiles").select("id, full_name, username").in("id", clavesSinNombrePos)
    : { data: [] as { id: string; full_name: string | null; username: string }[], error: null };
  if (errorPerfiles) throw new Error(`No se pudieron consultar los nombres de clientes: ${errorPerfiles.message}`);
  const nombrePorProfile = new Map(((perfiles ?? []) as { id: string; full_name: string | null; username: string }[]).map((p) => [p.id, p.full_name ?? p.username]));

  const ranking = [...acumulado.entries()]
    .map(([clave, v]) => ({ nombre: v.nombrePos ?? nombrePorProfile.get(clave) ?? "Cliente", total: v.total, compras: v.compras }))
    .sort((a, b) => b.total - a.total);

  const textoTabla = ranking.slice(0, limite).map((c, i) => `${i + 1}. ${c.nombre} — ${formatoMoneda(c.total)} en ${c.compras} compra(s)`).join("\n");
  const texto = `Mejores clientes de los últimos ${dias} día(s):\n${textoTabla}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ranking.slice(0, TOPE_FILAS_PDF_RANKING).map((c) => [c.nombre, formatoMoneda(c.total), String(c.compras)]);
  const bytes = await generarPdfTabla(`Mejores clientes — últimos ${dias} día(s)`, ["Cliente", "Total gastado", "Compras"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-clientes.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-clientes-merylay.pdf" }] };
}
