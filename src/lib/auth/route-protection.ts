import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

const PROTECTED_ROUTES: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/superadmin", roles: ["superadmin"] },
  { prefix: "/admin", roles: ["admin", "superadmin"] },
  { prefix: "/pos", roles: ["staff", "admin", "superadmin"] },
];

export function getRequiredRoles(pathname: string): UserRole[] | null {
  const match = PROTECTED_ROUTES.find((route) =>
    pathname.startsWith(route.prefix),
  );
  return match ? match.roles : null;
}

export function isRoleAllowed(
  userRole: UserRole | null,
  requiredRoles: UserRole[] | null,
): boolean {
  if (!requiredRoles) return true;
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}
