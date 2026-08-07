"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";

export async function guardarAjustes(
  input: StoreSettingsInput,
): Promise<{ error?: string }> {
  await requireSuperadmin();

  const parsed = storeSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const campos = Object.keys(STORE_SETTINGS_KEYS) as (keyof StoreSettingsInput)[];
  const rows = campos.map((campo) => ({
    key: STORE_SETTINGS_KEYS[campo],
    value: parsed.data[campo],
  }));

  const { error } = await supabase
    .from("store_settings")
    .upsert(rows, { onConflict: "key" });

  if (error) {
    return { error: "No se pudieron guardar los ajustes." };
  }

  revalidatePath("/superadmin/ajustes");
  return {};
}
