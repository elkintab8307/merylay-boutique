export interface MensajeEntrante {
  messageId: string;
  from: string;
  texto: string;
}

export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const mensaje = (payload as Record<string, unknown> | null)
    ?.entry as unknown[] | undefined;
  const primero = mensaje?.[0] as Record<string, unknown> | undefined;
  const cambios = primero?.changes as unknown[] | undefined;
  const valor = (cambios?.[0] as Record<string, unknown> | undefined)
    ?.value as Record<string, unknown> | undefined;
  const mensajes = valor?.messages as Record<string, unknown>[] | undefined;
  const entrada = mensajes?.[0];

  if (!entrada || entrada.type !== "text") {
    return null;
  }

  const texto = (entrada.text as Record<string, unknown> | undefined)?.body;
  if (typeof texto !== "string" || typeof entrada.id !== "string" || typeof entrada.from !== "string") {
    return null;
  }

  return { messageId: entrada.id, from: entrada.from, texto };
}
