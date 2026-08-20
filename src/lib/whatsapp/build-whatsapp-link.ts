/**
 * El WhatsApp de la tienda se guarda en store_settings como una URL
 * completa (ej. "https://api.whatsapp.com/send/?phone=...&text&...") en
 * vez de solo el numero, asi que para agregar un mensaje pre-armado hay
 * que reemplazar/agregar el parametro "text" sobre esa URL, no construir
 * un link desde cero.
 */
export function construirLinkWhatsapp(urlBase: string, mensaje: string): string {
  try {
    const url = new URL(urlBase);
    url.searchParams.set("text", mensaje);
    return url.toString();
  } catch {
    return urlBase;
  }
}
