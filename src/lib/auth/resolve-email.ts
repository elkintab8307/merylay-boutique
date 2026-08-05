"use server";

import { isEmail } from "./identifier";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (isEmail(trimmed)) {
    return trimmed;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", trimmed.toLowerCase())
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const { data: userData, error } = await admin.auth.admin.getUserById(
    profile.id,
  );

  if (error || !userData.user?.email) {
    return null;
  }

  return userData.user.email;
}
