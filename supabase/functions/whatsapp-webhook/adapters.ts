export type MensajeEntrante =
  | { kind: "texto"; messageId: string; from: string; texto: string }
  | { kind: "audio"; messageId: string; from: string; mediaId: string }
  | { kind: "boton"; messageId: string; from: string; botonId: string };

export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const entry = (payload as Record<string, unknown> | null)?.entry as unknown[] | undefined;
  const primero = entry?.[0] as Record<string, unknown> | undefined;
  const cambios = primero?.changes as unknown[] | undefined;
  const valor = (cambios?.[0] as Record<string, unknown> | undefined)?.value as Record<string, unknown> | undefined;
  const mensajes = valor?.messages as Record<string, unknown>[] | undefined;
  const entrada = mensajes?.[0];

  if (!entrada || typeof entrada.id !== "string" || typeof entrada.from !== "string") {
    return null;
  }
  const { id: messageId, from } = entrada;

  if (entrada.type === "text") {
    const texto = (entrada.text as Record<string, unknown> | undefined)?.body;
    if (typeof texto !== "string") return null;
    return { kind: "texto", messageId, from, texto };
  }

  if (entrada.type === "audio") {
    const mediaId = (entrada.audio as Record<string, unknown> | undefined)?.id;
    if (typeof mediaId !== "string") return null;
    return { kind: "audio", messageId, from, mediaId };
  }

  if (entrada.type === "interactive") {
    const interactive = entrada.interactive as Record<string, unknown> | undefined;
    if (interactive?.type !== "button_reply") return null;
    const botonId = (interactive.button_reply as Record<string, unknown> | undefined)?.id;
    if (typeof botonId !== "string") return null;
    return { kind: "boton", messageId, from, botonId };
  }

  return null;
}
