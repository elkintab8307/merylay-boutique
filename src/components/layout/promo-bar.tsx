import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";
import { MarquesinaPromocional } from "@/components/layout/marquesina-promocional";

export async function PromoBar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("key, value")
    .eq("key", STORE_SETTINGS_KEYS.frasesPromocionales)
    .maybeSingle();

  const guardadas = Array.isArray(data?.value)
    ? (data.value as unknown[]).map((f) => String(f))
    : [];

  return <MarquesinaPromocional frases={guardadas} />;
}
