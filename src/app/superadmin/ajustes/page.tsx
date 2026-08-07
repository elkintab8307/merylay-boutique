import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import { AjustesForm } from "./ajustes-form";

export default async function AjustesPage() {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("store_settings")
    .select("key, value");

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Ajustes de la tienda
        </h1>
        <p className="text-red-600">
          No se pudieron cargar los ajustes de la tienda.
        </p>
      </div>
    );
  }

  const valueByKey = new Map((rows ?? []).map((r) => [r.key, r.value]));

  const defaultValues: StoreSettingsInput = {
    nombreTienda: String(valueByKey.get(STORE_SETTINGS_KEYS.nombreTienda) ?? ""),
    contactoEmail: String(
      valueByKey.get(STORE_SETTINGS_KEYS.contactoEmail) ?? "",
    ),
    contactoTelefono: String(
      valueByKey.get(STORE_SETTINGS_KEYS.contactoTelefono) ?? "",
    ),
    envioCostoDefecto: Number(
      valueByKey.get(STORE_SETTINGS_KEYS.envioCostoDefecto) ?? 0,
    ),
    redesInstagram: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesInstagram) ?? "",
    ),
    redesFacebook: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesFacebook) ?? "",
    ),
    redesTiktok: String(valueByKey.get(STORE_SETTINGS_KEYS.redesTiktok) ?? ""),
    redesWhatsapp: String(
      valueByKey.get(STORE_SETTINGS_KEYS.redesWhatsapp) ?? "",
    ),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Ajustes de la tienda
      </h1>
      <AjustesForm defaultValues={defaultValues} />
    </div>
  );
}
