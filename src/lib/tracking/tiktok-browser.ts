// Eventos del navegador para el Pixel de TikTok. Todas las funciones son
// no-op si el pixel no esta cargado (sin NEXT_PUBLIC_TIKTOK_PIXEL_ID o aun
// sin cargar el script), asi que nunca rompen la tienda.

export type ProductoTracking = {
  id: string; // id del producto (content_id)
  name: string;
  price: number; // precio unitario en COP
  quantity?: number;
};

const MONEDA = "COP";

type Ttq = { track: (evento: string, datos: unknown, opciones?: unknown) => void; identify: (datos: unknown) => void; page: () => void };

function ttq(): Ttq | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ttq?: Ttq }).ttq;
}

function contenidos(productos: ProductoTracking[]) {
  return productos.map((p) => ({
    content_id: p.id,
    content_type: "product",
    content_name: p.name,
    price: p.price,
    quantity: p.quantity ?? 1,
  }));
}

function total(productos: ProductoTracking[]): number {
  return productos.reduce((suma, p) => suma + p.price * (p.quantity ?? 1), 0);
}

export function nuevoEventId(): string {
  return crypto.randomUUID();
}

export function trackViewContent(producto: ProductoTracking) {
  ttq()?.track("ViewContent", {
    contents: contenidos([producto]),
    value: producto.price,
    currency: MONEDA,
  }, { event_id: nuevoEventId() });
}

export function trackAddToCart(producto: ProductoTracking) {
  ttq()?.track("AddToCart", {
    contents: contenidos([producto]),
    value: producto.price * (producto.quantity ?? 1),
    currency: MONEDA,
  }, { event_id: nuevoEventId() });
}

export function trackInitiateCheckout(productos: ProductoTracking[]) {
  ttq()?.track("InitiateCheckout", {
    contents: contenidos(productos),
    value: total(productos),
    currency: MONEDA,
  }, { event_id: nuevoEventId() });
}

// El eventId debe ser el id del pedido: es el mismo que envia el servidor
// (Events API), y TikTok deduplica por event_id.
// `valor` es el total real del pedido (incluye envio); debe coincidir con el
// que envia el servidor.
export function trackPurchase(productos: ProductoTracking[], valor: number, eventId: string) {
  ttq()?.track("Purchase", {
    contents: contenidos(productos),
    value: valor,
    currency: MONEDA,
  }, { event_id: eventId });
}

export function identificarClienta(datos: { email?: string; telefonoE164?: string; externalId?: string }) {
  const payload: Record<string, string> = {};
  if (datos.email) payload.email = datos.email.trim().toLowerCase();
  if (datos.telefonoE164) payload.phone_number = datos.telefonoE164;
  if (datos.externalId) payload.external_id = datos.externalId;
  if (Object.keys(payload).length === 0) return;
  ttq()?.identify(payload);
}

export function registrarVistaPagina() {
  ttq()?.page();
}
