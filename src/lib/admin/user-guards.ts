export function puedeCambiarRol(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}

export function puedeBloquear(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}
