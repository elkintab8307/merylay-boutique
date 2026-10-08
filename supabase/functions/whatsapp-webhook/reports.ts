import { getSupabase } from "../_shared/db.ts";
import { subirYFirmar } from "./catalog.ts";
import { generarPdfTabla } from "./pdf-render.ts";
import { ESTADOS_PEDIDO_VENDIDO, escaparValorFiltro, formatoMoneda, type RespuestaLectura } from "./owner-actions.ts";

const TOPE_FILAS_PDF_DETALLE = 200;

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
    new Date(f.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }),
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

export async function historialCliente(nombreOTelefono: string): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const patron = escaparValorFiltro(`%${nombreOTelefono}%`);

  const { data: perfiles, error: errorPerfiles } = await supabase
    .from("profiles")
    .select("id, full_name, username")
    .or(`full_name.ilike.${patron},username.ilike.${patron},whatsapp.ilike.${patron},phone.ilike.${patron}`)
    .limit(5);
  if (errorPerfiles) throw new Error(`No se pudo buscar el cliente: ${errorPerfiles.message}`);

  const { data: clientesPos, error: errorPos } = await supabase
    .from("pos_customers")
    .select("id, profile_id, nombre")
    .or(`nombre.ilike.${patron},telefono.ilike.${patron}`)
    .limit(5);
  if (errorPos) throw new Error(`No se pudo buscar el cliente: ${errorPos.message}`);

  const filasPerfiles = (perfiles ?? []) as { id: string; full_name: string | null; username: string }[];
  const filasPos = (clientesPos ?? []) as { id: string; profile_id: string | null; nombre: string }[];

  // Un pos_customer vinculado (profile_id) a un perfil que YA aparecio en
  // la busqueda de perfiles es la MISMA persona, no un candidato adicional.
  const idsPerfilesEncontrados = new Set(filasPerfiles.map((p) => p.id));
  const posIndependientes = filasPos.filter((pc) => !pc.profile_id || !idsPerfilesEncontrados.has(pc.profile_id));

  const totalCandidatos = filasPerfiles.length + posIndependientes.length;
  if (totalCandidatos === 0) {
    return { texto: `No encontré ningún cliente que coincida con "${nombreOTelefono}".`, fotos: [], documentos: [] };
  }
  if (totalCandidatos > 1) {
    const nombres = [...filasPerfiles.map((p) => p.full_name ?? p.username), ...posIndependientes.map((c) => c.nombre)];
    return { texto: `Encontré varios clientes que coinciden: ${nombres.join(", ")}. ¿Puedes darme el nombre completo o el teléfono exacto?`, fotos: [], documentos: [] };
  }

  let profileId: string | null;
  let posCustomerIds: string[];
  let nombre: string;
  if (filasPerfiles.length === 1) {
    profileId = filasPerfiles[0].id;
    nombre = filasPerfiles[0].full_name ?? filasPerfiles[0].username;
    // Este perfil puede tener uno o mas pos_customers vinculados que no
    // aparecieron en la busqueda de texto (su nombre de POS puede ser
    // distinto) -- se buscan directo por profile_id, no por texto. No hay
    // restriccion de unicidad en profile_id, asi que se recogen TODOS los
    // vinculados, igual que informeClientes ya hace al sumarlos.
    const { data: posVinculados, error: errorPosVinculados } = await supabase.from("pos_customers").select("id").eq("profile_id", profileId);
    if (errorPosVinculados) throw new Error(`No se pudo buscar el cliente de POS vinculado: ${errorPosVinculados.message}`);
    posCustomerIds = ((posVinculados ?? []) as { id: string }[]).map((c) => c.id);
  } else {
    posCustomerIds = [posIndependientes[0].id];
    profileId = posIndependientes[0].profile_id;
    nombre = posIndependientes[0].nombre;
  }

  const [pedidos, ventasPos] = await Promise.all([
    profileId
      ? supabase.from("orders").select("order_number, total, created_at, channel").eq("user_id", profileId).in("status", ESTADOS_PEDIDO_VENDIDO).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
    posCustomerIds.length > 0
      ? supabase.from("pos_sales").select("sale_number, total, created_at").in("customer_id", posCustomerIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (pedidos.error) throw new Error(`No se pudo consultar el historial de pedidos: ${pedidos.error.message}`);
  if (ventasPos.error) throw new Error(`No se pudo consultar el historial de ventas POS: ${ventasPos.error.message}`);

  const filasPedidosHist = (pedidos.data ?? []) as { order_number: string; total: number; created_at: string; channel: string }[];
  const filasPosHist = (ventasPos.data ?? []) as { sale_number: string; total: number; created_at: string }[];

  const todas = [
    ...filasPedidosHist.map((p) => ({ numero: p.order_number, canal: p.channel, total: Number(p.total), fecha: p.created_at })),
    ...filasPosHist.map((v) => ({ numero: v.sale_number, canal: "pos", total: Number(v.total), fecha: v.created_at })),
  ].sort((a, b) => (a.fecha > b.fecha ? -1 : 1));

  if (todas.length === 0) {
    return { texto: `${nombre} no tiene compras registradas todavía.`, fotos: [], documentos: [] };
  }

  // El total SIEMPRE se calcula sobre TODAS las compras (`todas`); solo el
  // texto listado se acota a las 10 mas recientes, para no exceder el
  // limite de 4096 caracteres de la Graph API de WhatsApp con clientes de
  // muchas compras.
  const totalGastado = todas.reduce((suma, c) => suma + c.total, 0);
  const TOPE_HISTORIAL_TEXTO = 10;
  const detalle = todas.slice(0, TOPE_HISTORIAL_TEXTO).map((c) => `${new Date(c.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} (${c.canal}) — ${c.numero}: ${formatoMoneda(c.total)}`).join("\n");
  const notaTruncado = todas.length > TOPE_HISTORIAL_TEXTO ? `\n… y ${todas.length - TOPE_HISTORIAL_TEXTO} compra(s) más.` : "";
  const texto = `Historial de ${nombre}: ${formatoMoneda(totalGastado)} en ${todas.length} compra(s).\n${detalle}${notaTruncado}`;

  return { texto, fotos: [], documentos: [] };
}

export async function informeGastos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  // expense_date es tipo `date` (no timestamptz) -- se compara con una
  // fecha YYYY-MM-DD, no con una marca de tiempo completa.
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("expenses")
    .select("description, amount, expense_date, expense_categories(name)")
    .gte("expense_date", desde);
  if (error) throw new Error(`No se pudieron consultar los gastos: ${error.message}`);

  const filas = (data ?? []) as unknown as { description: string; amount: number; expense_date: string; expense_categories: { name: string } | null }[];
  if (filas.length === 0) {
    return { texto: `No hubo gastos registrados en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const total = filas.reduce((suma, g) => suma + Number(g.amount), 0);
  const porCategoria = new Map<string, number>();
  for (const g of filas) {
    const categoria = g.expense_categories?.name ?? "Sin categoría";
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + Number(g.amount));
  }
  const lineaCategorias = [...porCategoria.entries()].map(([categoria, monto]) => `${categoria}: ${formatoMoneda(monto)}`).join(", ");

  const texto = `Gastos de los últimos ${dias} día(s): ${formatoMoneda(total)}.\nPor categoría: ${lineaCategorias}.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = [...filas]
    .sort((a, b) => (a.expense_date > b.expense_date ? -1 : 1))
    .slice(0, TOPE_FILAS_PDF_DETALLE)
    .map((g) => [
      // expense_date es `date` (no timestamptz): ya es un dia calendario sin
      // componente horario, y new Date("YYYY-MM-DD") lo parsea como
      // medianoche UTC. Fijar explicitamente { timeZone: "UTC" } (en vez de
      // dejar que toLocaleDateString use la zona horaria de la sesion, o
      // peor, "America/Bogota") evita que se corra un dia hacia atras; esto
      // es deliberado y DISTINTO del tratamiento de orders/pos_sales mas
      // abajo, que si son timestamptz y si necesitan America/Bogota.
      new Date(g.expense_date).toLocaleDateString("es-CO", { timeZone: "UTC" }),
      g.expense_categories?.name ?? "Sin categoría",
      g.description,
      formatoMoneda(Number(g.amount)),
    ]);

  const bytes = await generarPdfTabla(`Informe de gastos — últimos ${dias} día(s)`, ["Fecha", "Categoría", "Descripción", "Monto"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-gastos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-gastos-merylay.pdf" }] };
}

// Resuelve el nombre a mostrar de uno o mas pos_customers.id: el nombre
// real del perfil si esta vinculado (profile_id), si no el nombre
// registrado en POS. Mismo criterio de fusion de identidad que
// informeClientes/historialCliente, pero como resolucion de nombre
// simple (no suma montos) -- lo reutilizan informeCreditos e
// informeAbonos para mostrar el cliente de cada venta/abono individual.
async function nombresClientesPos(customerIds: string[]): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();
  const supabase = getSupabase();
  const { data: posCustomers, error } = await supabase.from("pos_customers").select("id, profile_id, nombre").in("id", customerIds);
  if (error) throw new Error(`No se pudieron consultar los clientes de POS: ${error.message}`);
  const filas = (posCustomers ?? []) as { id: string; profile_id: string | null; nombre: string }[];

  const idsConPerfil = filas.filter((f) => f.profile_id).map((f) => f.profile_id as string);
  const { data: perfiles, error: errorPerfiles } = idsConPerfil.length > 0
    ? await supabase.from("profiles").select("id, full_name, username").in("id", idsConPerfil)
    : { data: [] as { id: string; full_name: string | null; username: string }[], error: null };
  if (errorPerfiles) throw new Error(`No se pudieron consultar los nombres de clientes: ${errorPerfiles.message}`);
  const nombrePorProfile = new Map(((perfiles ?? []) as { id: string; full_name: string | null; username: string }[]).map((p) => [p.id, p.full_name ?? p.username]));

  return new Map(filas.map((f) => [f.id, (f.profile_id && nombrePorProfile.get(f.profile_id)) || f.nombre]));
}

export async function informeCreditos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("pos_sales")
    .select("id, sale_number, customer_id, total, created_at")
    .eq("payment_method", "credito")
    .gte("created_at", desde);
  if (error) throw new Error(`No se pudieron consultar las ventas a crédito: ${error.message}`);

  const ventas = (data ?? []) as { id: string; sale_number: string; customer_id: string | null; total: number; created_at: string }[];
  if (ventas.length === 0) {
    return { texto: `No hubo ventas a crédito en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsVenta = ventas.map((v) => v.id);
  const { data: cuotas, error: errorCuotas } = await supabase
    .from("credit_installments")
    .select("sale_id, amount, paid_amount, status")
    .in("sale_id", idsVenta);
  if (errorCuotas) throw new Error(`No se pudieron consultar las cuotas de crédito: ${errorCuotas.message}`);
  const filasCuotas = (cuotas ?? []) as { sale_id: string; amount: number; paid_amount: number; status: string }[];

  const saldoPorVenta = new Map<string, number>();
  const pendientePorVenta = new Map<string, boolean>();
  for (const c of filasCuotas) {
    saldoPorVenta.set(c.sale_id, (saldoPorVenta.get(c.sale_id) ?? 0) + Number(c.amount) - Number(c.paid_amount));
    if (c.status !== "pagada") pendientePorVenta.set(c.sale_id, true);
  }

  const totalVendido = ventas.reduce((suma, v) => suma + Number(v.total), 0);
  const conSaldoPendiente = ventas.filter((v) => pendientePorVenta.get(v.id)).length;

  const texto = `Ventas a crédito de los últimos ${dias} día(s): ${formatoMoneda(totalVendido)} en ${ventas.length} venta(s), ${conSaldoPendiente} con saldo pendiente.`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const idsCliente = [...new Set(ventas.map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const nombrePorCliente = await nombresClientesPos(idsCliente);

  const { data: items, error: errorItems } = await supabase
    .from("pos_sale_items")
    .select("sale_id, product_id")
    .in("sale_id", idsVenta);
  if (errorItems) throw new Error(`No se pudieron consultar los productos de las ventas a crédito: ${errorItems.message}`);
  const filasItems = (items ?? []) as { sale_id: string; product_id: string | null }[];

  const idsProductos = [...new Set(filasItems.map((i) => i.product_id).filter((id): id is string => Boolean(id)))];
  const { data: productosData, error: errorProductos } = idsProductos.length > 0
    ? await supabase.from("products").select("id, name").in("id", idsProductos)
    : { data: [] as { id: string; name: string }[], error: null };
  if (errorProductos) throw new Error(`No se pudieron consultar los nombres de productos: ${errorProductos.message}`);
  const nombrePorProducto = new Map(((productosData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const productosPorVenta = new Map<string, string[]>();
  for (const it of filasItems) {
    const lista = productosPorVenta.get(it.sale_id) ?? [];
    lista.push(it.product_id ? (nombrePorProducto.get(it.product_id) ?? "(producto eliminado)") : "(producto eliminado)");
    productosPorVenta.set(it.sale_id, lista);
  }

  const filasTabla = [...ventas]
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    .slice(0, TOPE_FILAS_PDF_DETALLE)
    .map((v) => [
      new Date(v.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }),
      v.customer_id ? (nombrePorCliente.get(v.customer_id) ?? "Cliente") : "Cliente",
      (productosPorVenta.get(v.id) ?? []).join(", ") || "—",
      formatoMoneda(Number(v.total)),
      formatoMoneda(Math.max(0, saldoPorVenta.get(v.id) ?? 0)),
    ]);

  const bytes = await generarPdfTabla(`Ventas a crédito — últimos ${dias} día(s)`, ["Fecha", "Cliente", "Productos", "Total", "Saldo pendiente"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-creditos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-creditos-merylay.pdf" }] };
}

export async function informeAbonos(dias: number, conPdf: boolean): Promise<RespuestaLectura> {
  const supabase = getSupabase();
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("credit_payments")
    .select("id, sale_id, amount, payment_method, created_at")
    .gte("created_at", desde);
  if (error) throw new Error(`No se pudieron consultar los abonos: ${error.message}`);

  const abonos = (data ?? []) as { id: string; sale_id: string; amount: number; payment_method: string; created_at: string }[];
  if (abonos.length === 0) {
    return { texto: `No hubo abonos registrados en los últimos ${dias} día(s).`, fotos: [], documentos: [] };
  }

  const idsVenta = [...new Set(abonos.map((a) => a.sale_id))];
  const { data: ventasData, error: errorVentas } = await supabase
    .from("pos_sales")
    .select("id, sale_number, customer_id")
    .in("id", idsVenta);
  if (errorVentas) throw new Error(`No se pudieron consultar las ventas de los abonos: ${errorVentas.message}`);
  const ventas = (ventasData ?? []) as { id: string; sale_number: string; customer_id: string | null }[];
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));

  const idsCliente = [...new Set(ventas.map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const nombrePorCliente = await nombresClientesPos(idsCliente);

  const totalAbonado = abonos.reduce((suma, a) => suma + Number(a.amount), 0);

  // A diferencia de los otros informes, aqui el texto SI lista cada abono
  // individual (no solo el total): es la pregunta literal que motivo este
  // informe ("que cliente hizo abonos hoy"), y con "dias" cortos (ej. 1)
  // en la practica siempre son pocos -- mismo tope de 10 que el resto.
  const TOPE_ABONOS_TEXTO = 10;
  const ordenados = [...abonos].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
  const nombreClienteDeAbono = (a: { sale_id: string }) => {
    const venta = ventaPorId.get(a.sale_id);
    return venta?.customer_id ? (nombrePorCliente.get(venta.customer_id) ?? "Cliente") : "Cliente";
  };
  const detalle = ordenados.slice(0, TOPE_ABONOS_TEXTO)
    .map((a) => `${new Date(a.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} — ${nombreClienteDeAbono(a)}: ${formatoMoneda(Number(a.amount))}`)
    .join("\n");
  const notaTruncado = abonos.length > TOPE_ABONOS_TEXTO ? `\n… y ${abonos.length - TOPE_ABONOS_TEXTO} abono(s) más.` : "";

  const texto = `Abonos de los últimos ${dias} día(s): ${formatoMoneda(totalAbonado)} en ${abonos.length} abono(s).\n${detalle}${notaTruncado}`;

  if (!conPdf) {
    return { texto, fotos: [], documentos: [] };
  }

  const filasTabla = ordenados.slice(0, TOPE_FILAS_PDF_DETALLE).map((a) => {
    const venta = ventaPorId.get(a.sale_id);
    return [
      new Date(a.created_at).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }),
      nombreClienteDeAbono(a),
      formatoMoneda(Number(a.amount)),
      a.payment_method,
      venta?.sale_number ?? "—",
    ];
  });

  const bytes = await generarPdfTabla(`Abonos — últimos ${dias} día(s)`, ["Fecha", "Cliente", "Monto", "Método", "Venta"], filasTabla);
  const link = await subirYFirmar(bytes, "informe-abonos.pdf");

  return { texto, fotos: [], documentos: [{ link, filename: "informe-abonos-merylay.pdf" }] };
}
