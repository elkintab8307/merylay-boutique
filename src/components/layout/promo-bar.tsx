import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";

export async function PromoBar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", STORE_SETTINGS_KEYS.mensajePromocional)
    .maybeSingle();

  const mensaje = data?.value ? String(data.value).trim() : "";
  if (!mensaje) return null;

  return (
    <div className="bg-brand-rosa px-4 py-2 text-center text-xs font-medium text-brand-crema sm:text-sm">
      {mensaje}
    </div>
  );
}
