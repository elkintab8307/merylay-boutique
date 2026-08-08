import { createHash, timingSafeEqual } from "node:crypto";

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
  const checksumCalculado = createHash("sha256").update(cadena).digest("hex").toLowerCase();
  const checksumRecibido = evento.signature.checksum.toLowerCase();

  // Comparacion en tiempo constante: evita filtrar por timing cuanto del
  // checksum coincide. Buffer.from(str, "hex") no lanza con hex invalido
  // (simplemente decodifica lo que pueda), por lo que el guard de longitud
  // cubre tambien el caso de un checksum mal formado sin lanzar excepcion.
  const bufferCalculado = Buffer.from(checksumCalculado, "hex");
  const bufferRecibido = Buffer.from(checksumRecibido, "hex");

  if (bufferCalculado.length !== bufferRecibido.length) {
    return false;
  }

  return timingSafeEqual(bufferCalculado, bufferRecibido);
}
