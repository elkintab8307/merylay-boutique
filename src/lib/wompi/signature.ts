import { createHash } from "node:crypto";

export function calcularFirmaIntegridad(
  reference: string,
  amountInCents: number,
  currency: string,
  secret: string,
): string {
  const cadena = `${reference}${amountInCents}${currency}${secret}`;
  return createHash("sha256").update(cadena).digest("hex");
}

type EventoWompi = {
  data: Record<string, unknown>;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
};

function obtenerValorPorRuta(objeto: unknown, ruta: string): string {
  const partes = ruta.split(".");
  let valor: unknown = objeto;
  for (const parte of partes) {
    valor = (valor as Record<string, unknown> | undefined)?.[parte];
  }
  return String(valor);
}

export function verificarFirmaEvento(evento: EventoWompi, secret: string): boolean {
  const valores = evento.signature.properties.map((ruta) =>
    obtenerValorPorRuta(evento.data, ruta),
  );
  const cadena = `${valores.join("")}${evento.timestamp}${secret}`;
  const checksumCalculado = createHash("sha256").update(cadena).digest("hex");
  return checksumCalculado.toLowerCase() === evento.signature.checksum.toLowerCase();
}
