import type { Database } from "@/lib/supabase/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

export function destinoPorRol(role: UserRole | undefined): string {
  if (role === "superadmin" || role === "admin") return "/admin";
  if (role === "staff") return "/pos";
  return "/";
}
