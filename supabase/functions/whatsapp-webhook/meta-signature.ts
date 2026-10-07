import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

export function verificarFirmaMeta(
  payloadRaw: string,
  firmaHeader: string | null,
  appSecret: string,
): boolean {
  // Fail-closed: con un secreto vacio cualquiera puede calcular
  // HMAC-SHA256("", payload) y falsificar una firma "valida".
  if (!appSecret) {
    return false;
  }
  if (!firmaHeader || !firmaHeader.startsWith("sha256=")) {
    return false;
  }
  const firmaRecibida = Buffer.from(firmaHeader.slice("sha256=".length));
  const firmaCalculada = Buffer.from(createHmac("sha256", appSecret).update(payloadRaw).digest("hex"));
  // timingSafeEqual lanza si las longitudes difieren: se descarta antes.
  if (firmaRecibida.length !== firmaCalculada.length) {
    return false;
  }
  return timingSafeEqual(firmaCalculada, firmaRecibida);
}
