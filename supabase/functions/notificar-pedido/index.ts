import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../_shared/db.ts";
import { enviarTexto, enviarImagenPorLink } from "../_shared/meta.ts";

type Supabase = SupabaseClient;

interface PayloadWebhook {
  type: string;
  table: "orders" | "pos_sales" | "credit_payments";
  record: Record<string, unknown>;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

interface ItemNotificacion {
  fotoUrl: string | null;
  caption: string;
}

interface NotificacionVenta {
  encabezado: string;
  items: ItemNotificacion[];
  resumen: string;
}

// La foto DIRECTA del item (image_id, el estampado/foto real que se vendio)
// tiene prioridad; si no hay, cae a la foto principal del producto. Nunca
// deja un item sin intentar mostrar algo -- "cualquier informe/aviso que
// implique un producto debe mostrar foto" es un requisito real del dueño,
// repetido aqui para las notificaciones de venta.
async function fotoDelItem(supabase: Supabase, imageId: string | null, productId: string | null): Promise<string | null> {
  if (imageId) {
    const { data } = await supabase.from("product_images").select("url").eq("id", imageId).maybeSingle();
    const url = (data as { url: string } | null)?.url;
    if (url) return url;
  }
  if (!productId) return null;
  const { data } = await supabase.from("product_images").select("url, is_primary").eq("product_id", productId);
  const filas = (data ?? []) as { url: string; is_primary: boolean }[];
  return (filas.find((f) => f.is_primary) ?? filas[0])?.url ?? null;
}

// Nombre real del cliente de POS (perfil vinculado si existe, si no el
// nombre registrado en POS) -- mismo criterio de fusion de identidad que
// reports.ts, duplicado aqui porque notificar-pedido es una Edge Function
// separada (no comparte modulos con whatsapp-webhook mas alla de _shared/).
async function nombreClientePos(supabase: Supabase, customerId: string): Promise<string | null> {
  const { data } = await supabase.from("pos_customers").select("profile_id, nombre").eq("id", customerId).maybeSingle();
  const cliente = data as { profile_id: string | null; nombre: string } | null;
  if (!cliente) return null;
  if (cliente.profile_id) {
    const { data: perfil } = await supabase.from("profiles").select("full_name, username").eq("id", cliente.profile_id).maybeSingle();
    const p = perfil as { full_name: string | null; username: string } | null;
    if (p) return p.full_name ?? p.username;
  }
  return cliente.nombre;
}

async function datosVentaOrders(supabase: Supabase, record: Record<string, unknown>): Promise<NotificacionVenta> {
  const orderId = record.id as string;
  const orderNumber = (record.order_number as string) ?? "—";
  const total = Number(record.total ?? 0);
  const metodo = (record.payment_method as string | null) ?? "—";

  const { data } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, line_total, image_id, product_id")
    .eq("order_id", orderId);
  const filas = (data ?? []) as { name_snapshot: string; qty: number; line_total: number; image_id: string | null; product_id: string | null }[];

  const items = await Promise.all(filas.map(async (f) => ({
    fotoUrl: await fotoDelItem(supabase, f.image_id, f.product_id),
    caption: `👗 ${f.qty > 1 ? `${f.qty}x ` : ""}${f.name_snapshot}\nValor: ${formatoMoneda(Number(f.line_total))}`,
  })));

  return {
    encabezado: `💕 ¡Tienes una nueva venta por tu tienda! (Pedido ${orderNumber})`,
    items,
    resumen: `💳 Método de pago: ${metodo}\n\n💰 Total pagado: ${formatoMoneda(total)}`,
  };
}

async function datosVentaPos(supabase: Supabase, record: Record<string, unknown>): Promise<NotificacionVenta> {
  const saleId = record.id as string;
  const saleNumber = (record.sale_number as string) ?? "—";
  const total = Number(record.total ?? 0);
  const metodo = (record.payment_method as string) ?? "—";
  const customerId = record.customer_id as string | null;

  const { data } = await supabase
    .from("pos_sale_items")
    .select("product_id, variant_id, qty, line_total, image_id")
    .eq("sale_id", saleId);
  const filas = (data ?? []) as { product_id: string | null; variant_id: string | null; qty: number; line_total: number; image_id: string | null }[];

  const idsProductos = [...new Set(filas.map((f) => f.product_id).filter((id): id is string => Boolean(id)))];
  const idsVariantes = [...new Set(filas.map((f) => f.variant_id).filter((id): id is string => Boolean(id)))];
  const [productosRes, variantesRes] = await Promise.all([
    idsProductos.length > 0
      ? supabase.from("products").select("id, name").in("id", idsProductos)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    idsVariantes.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", idsVariantes)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
  ]);
  const nombrePorProducto = new Map(((productosRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const variantePorId = new Map(((variantesRes.data ?? []) as { id: string; talla: string | null; color: string | null }[]).map((v) => [v.id, v]));

  const items = await Promise.all(filas.map(async (f) => {
    const nombre = f.product_id ? (nombrePorProducto.get(f.product_id) ?? "(producto eliminado)") : "(producto eliminado)";
    const variante = f.variant_id ? variantePorId.get(f.variant_id) : undefined;
    const detalle = variante ? [variante.talla ? `Talla ${variante.talla}` : null, variante.color].filter(Boolean).join(" · ") : "";
    return {
      fotoUrl: await fotoDelItem(supabase, f.image_id, f.product_id),
      caption: `👗 ${f.qty > 1 ? `${f.qty}x ` : ""}${nombre}${detalle ? ` (${detalle})` : ""}\nValor: ${formatoMoneda(Number(f.line_total))}`,
    };
  }));

  const nombreCliente = customerId ? await nombreClientePos(supabase, customerId) : null;

  let bloqueCredito = "";
  const esCredito = metodo === "credito";
  if (esCredito) {
    const [pagosRes, cuotasRes] = await Promise.all([
      supabase.from("credit_payments").select("amount").eq("sale_id", saleId),
      supabase.from("credit_installments").select("amount, paid_amount").eq("sale_id", saleId),
    ]);
    const abonoInicial = ((pagosRes.data ?? []) as { amount: number }[]).reduce((suma: number, p: { amount: number }) => suma + Number(p.amount), 0);
    const saldo = Math.max(0, ((cuotasRes.data ?? []) as { amount: number; paid_amount: number }[]).reduce((suma: number, c: { amount: number; paid_amount: number }) => suma + Number(c.amount) - Number(c.paid_amount), 0));
    bloqueCredito = `\n🧾 Venta a crédito` +
      (abonoInicial > 0 ? `\n✅ Abono inicial: ${formatoMoneda(abonoInicial)}` : "") +
      `\n📊 Saldo pendiente: ${formatoMoneda(saldo)}`;
  }

  return {
    encabezado: `💕 ¡Tienes una nueva venta por tu sistema POS! (${saleNumber}${nombreCliente ? ` — ${nombreCliente}` : ""})`,
    items,
    resumen: `💳 Método de pago: ${metodo}${bloqueCredito}\n\n💰 Total${esCredito ? " de la venta" : " pagado"}: ${formatoMoneda(total)}`,
  };
}

// A diferencia de una venta nueva, un abono no trae items que mostrar con
// foto -- es un pago contra un saldo ya existente. El mensaje sigue el
// formato pedido por el dueño: cliente, monto, y a que producto(s)
// corresponde el credito, mas el saldo que queda tras este abono.
async function datosAbonoCredito(supabase: Supabase, record: Record<string, unknown>): Promise<string | null> {
  const saleId = record.sale_id as string;
  const monto = Number(record.amount ?? 0);
  const metodo = (record.payment_method as string) ?? "—";

  const { data: ventaData } = await supabase.from("pos_sales").select("sale_number, customer_id").eq("id", saleId).maybeSingle();
  const venta = ventaData as { sale_number: string; customer_id: string | null } | null;
  if (!venta) return null;

  const nombreCliente = venta.customer_id ? ((await nombreClientePos(supabase, venta.customer_id)) ?? "Cliente") : "Cliente";

  const { data: itemsData } = await supabase.from("pos_sale_items").select("product_id").eq("sale_id", saleId);
  const idsProductos = [...new Set(((itemsData ?? []) as { product_id: string | null }[]).map((i) => i.product_id).filter((id): id is string => Boolean(id)))];
  const { data: productosData } = idsProductos.length > 0
    ? await supabase.from("products").select("name").in("id", idsProductos)
    : { data: [] as { name: string }[] };
  const refProductos = ((productosData ?? []) as { name: string }[]).map((p) => p.name).join(", ") || venta.sale_number;

  const { data: cuotasData } = await supabase.from("credit_installments").select("amount, paid_amount").eq("sale_id", saleId);
  const saldo = Math.max(0, ((cuotasData ?? []) as { amount: number; paid_amount: number }[]).reduce((suma: number, c: { amount: number; paid_amount: number }) => suma + Number(c.amount) - Number(c.paid_amount), 0));

  return `💰 El cliente "${nombreCliente}" abonó ${formatoMoneda(monto)} al crédito de "${refProductos}".\n💳 Método: ${metodo}\n📊 Saldo pendiente: ${formatoMoneda(saldo)}`;
}

async function enviarNotificacionVenta(numero: string, datos: NotificacionVenta): Promise<void> {
  await enviarTexto(numero, datos.encabezado);
  for (const item of datos.items) {
    if (item.fotoUrl) {
      await enviarImagenPorLink(numero, item.fotoUrl, item.caption);
    } else {
      await enviarTexto(numero, item.caption);
    }
  }
  await enviarTexto(numero, datos.resumen);
}

export async function handleRequest(req: Request): Promise<Response> {
  const secretoEsperado = Deno.env.get("NOTIFICAR_PEDIDO_SECRET") ?? "";
  const secretoRecibido = req.headers.get("x-notificar-pedido-secret") ?? "";
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return new Response("No autorizado.", { status: 401 });
  }

  const payload = (await req.json()) as PayloadWebhook;
  const numeros = (Deno.env.get("WHATSAPP_OWNER_NUMBERS") ?? "").split(",").map((n) => n.trim()).filter(Boolean);
  const supabase = getSupabase();

  if (payload.table === "credit_payments") {
    const texto = await datosAbonoCredito(supabase, payload.record);
    if (texto) {
      const resultados = await Promise.allSettled(numeros.map((numero) => enviarTexto(numero, texto)));
      for (const [i, resultado] of resultados.entries()) {
        if (resultado.status === "rejected") {
          console.error(`notificar-pedido: fallo al enviar a ${numeros[i]}:`, resultado.reason);
        }
      }
    }
    return new Response("OK", { status: 200 });
  }

  const datos = payload.table === "orders"
    ? await datosVentaOrders(supabase, payload.record)
    : await datosVentaPos(supabase, payload.record);

  const resultados = await Promise.allSettled(numeros.map((numero) => enviarNotificacionVenta(numero, datos)));
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status === "rejected") {
      console.error(`notificar-pedido: fallo al enviar a ${numeros[i]}:`, resultado.reason);
    }
  }

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
