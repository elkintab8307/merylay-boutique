const ESTADOS_NOTIFICABLES = new Set(["enviado", "entregado", "cancelado"]);

export function debeNotificarCambioEstado(nuevoEstado: string): boolean {
  return ESTADOS_NOTIFICABLES.has(nuevoEstado);
}
