/**
 * Sanitiza una query de busqueda de usuario antes de interpolarla en un
 * filtro `.or()` de PostgREST (supabase-js). Los caracteres `%`, `,`, `(`
 * y `)` tienen significado especial en la sintaxis de filtros de PostgREST
 * (`%` es comodin de `ilike`; `,`, `(` y `)` delimitan y agrupan
 * condiciones dentro de `.or()`), asi que deben despojarse para evitar que
 * el usuario inyecte condiciones o comodines inesperados en la consulta.
 *
 * Ver commit 366f417 ("fix: sanitiza el query de busqueda de clientes antes
 * del filtro .or()") para el incidente original que motivo esta funcion.
 */
export function sanitizarQueryBusqueda(query: string): string {
  return query.trim().replace(/[%,()]/g, "");
}
