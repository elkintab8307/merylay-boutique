export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Mismo criterio que el trigger handle_new_user() en
// supabase/migrations/001_roles_y_profiles.sql (reutilizado por
// 031_registro_clientes.sql): primero quita los caracteres que no son
// [a-z0-9] con un patron sensible a mayusculas (igual que Postgres por
// defecto, que tambien descarta las mayusculas en ese paso), y recien
// despues pasa a minusculas. El orden importa: invertirlo no reproduce
// los usernames que el trigger ya genero y que estan guardados en la
// base de datos.
export function normalizeUsername(value: string): string {
  return value.replace(/[^a-z0-9]/g, "").toLowerCase();
}
