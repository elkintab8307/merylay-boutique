"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

export async function reimprimirUltimoRecibo(): Promise<{ error?: string }> {
  const currentUser = await getCurrentProfile();
  if (!currentUser) {
    return { error: "No hay sesión activa." };
  }

  const supabase = await createClient();
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id")
    .eq("staff_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!venta) {
    return { error: "Todavía no tienes ventas registradas." };
  }

  redirect(`/pos/venta/${venta.id}?print=1`);
}
