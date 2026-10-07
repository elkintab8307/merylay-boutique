import { createHmac } from "node:crypto";

export function verificarFirmaMeta(
  payloadRaw: string,
  firmaHeader: string | null,
  appSecret: string,
): boolean {
  if (!firmaHeader || !firmaHeader.startsWith("sha256=")) {
    return false;
  }
  const firmaRecibida = firmaHeader.slice("sha256=".length);
  const firmaCalculada = createHmac("sha256", appSecret).update(payloadRaw).digest("hex");
  return firmaCalculada === firmaRecibida;
}
