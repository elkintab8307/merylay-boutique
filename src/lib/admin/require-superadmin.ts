import { getCurrentProfile } from "@/lib/auth/get-current-user";

export async function requireSuperadmin() {
  const currentUser = await getCurrentProfile();
  if (!currentUser || currentUser.profile.role !== "superadmin") {
    throw new Error("No autorizado.");
  }
  return currentUser;
}
