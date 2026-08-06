import { createClient } from "@/lib/supabase/server";

export async function getOrCreateCart(userId: string): Promise<string> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error("No se pudo crear el carrito.");
  }
  return created.id;
}
