import { getCurrentProfile } from "@/lib/auth/get-current-user";
import type { UserRole } from "@/lib/auth/route-protection";

const ADMIN_ROLES: UserRole[] = ["admin", "superadmin"];

export async function requireAdmin() {
  const currentUser = await getCurrentProfile();
  if (!currentUser || !ADMIN_ROLES.includes(currentUser.profile.role)) {
    throw new Error("No autorizado.");
  }
  return currentUser;
}
