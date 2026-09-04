/**
 * Para productos CON variantes, `products.stock` lo calcula solo un
 * trigger en la base (suma del stock de las variantes -- migracion 050).
 * Las acciones de guardado NO deben escribir un valor manual en ese
 * caso, para no pisar el valor del trigger. Para productos sin variantes
 * no hay de donde calcularlo: sigue siendo manual.
 */
export function debeGuardarStockManual(cantidadVariantes: number): boolean {
  return cantidadVariantes === 0;
}
