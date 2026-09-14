/**
 * Regla de "Nueva Coleccion" por variante: una variante marcada queda
 * activa 5 dias y se apaga sola. No hay trigger ni job programado -- el
 * estado activo/inactivo se calcula aqui, al leer, siempre a partir de
 * `nueva_coleccion_desde` (columna en product_variants, migracion 052).
 * Este es el UNICO lugar donde vive el numero de dias.
 */

export const DURACION_NUEVA_COLECCION_DIAS = 5;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export function esNuevaColeccionActiva(
  desde: string | null,
  ahora: Date = new Date(),
): boolean {
  if (!desde) return false;
  const transcurridoMs = ahora.getTime() - new Date(desde).getTime();
  return transcurridoMs < DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
}

/**
 * Dias completos desde que expiro, o null si sigue activa o nunca se
 * activo. Se usa solo para el texto informativo del admin ("expiro hace
 * N dias").
 */
export function diasDesdeExpiracion(
  desde: string | null,
  ahora: Date = new Date(),
): number | null {
  if (!desde || esNuevaColeccionActiva(desde, ahora)) return null;
  const expiroEnMs =
    new Date(desde).getTime() + DURACION_NUEVA_COLECCION_DIAS * MS_POR_DIA;
  return Math.floor((ahora.getTime() - expiroEnMs) / MS_POR_DIA);
}

/**
 * Decide que guardar al enviar el formulario de producto. `actual` es el
 * valor real en la base de datos (nunca lo que mande el cliente);
 * `deseado` es el checkbox que llego en el envio. Si no hay cambio de
 * estado activo/inactivo, conserva `actual` tal cual -- para no
 * reiniciar el contador de una variante ya activa, ni perder la fecha
 * que permite mostrar "expiro hace N dias" de una ya expirada.
 */
export function resolverNuevaColeccionDesde(
  actual: string | null,
  deseado: boolean,
  ahora: Date = new Date(),
): string | null {
  const activaActualmente = esNuevaColeccionActiva(actual, ahora);
  if (deseado && !activaActualmente) return ahora.toISOString();
  if (!deseado && activaActualmente) return null;
  return actual;
}
