import { Phone, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";

export async function PromoBar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("key, value")
    .in("key", [STORE_SETTINGS_KEYS.mensajePromocional, STORE_SETTINGS_KEYS.contactoTelefono]);

  const settingsByKey = new Map((data ?? []).map((r) => [r.key, r.value]));
  const mensajeRaw = settingsByKey.get(STORE_SETTINGS_KEYS.mensajePromocional);
  const telefonoRaw = settingsByKey.get(STORE_SETTINGS_KEYS.contactoTelefono);
  const mensaje = mensajeRaw ? String(mensajeRaw).trim() : "";
  const telefono = telefonoRaw ? String(telefonoRaw).trim() : "";

  return (
    <div className="bg-brand-ciruela px-4 py-2 text-xs font-medium text-brand-crema sm:text-sm">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-1 sm:grid-cols-3">
        <span className="hidden items-center gap-2 sm:flex">
          <Truck className="h-4 w-4" />
          Envío a toda Colombia
        </span>
        <span className="text-center">{mensaje || "Envío a toda Colombia"}</span>
        {telefono ? (
          <a
            href={`tel:${telefono.replace(/\s+/g, "")}`}
            className="hidden items-center justify-end gap-2 sm:flex"
          >
            <Phone className="h-4 w-4" />
            Contáctanos: {telefono}
          </a>
        ) : (
          <span className="hidden sm:block" />
        )}
      </div>
    </div>
  );
}
