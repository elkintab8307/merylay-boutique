import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import {
  parseHeroStored,
  bannersStoredSchema,
  type HomeContenidoInput,
} from "@/lib/validation/home-contenido";
import { AjustesForm } from "./ajustes-form";
import { HomeContenidoForm } from "./home-contenido-form";
import { horarioPorDefecto, horarioSchema } from "@/lib/validation/horario";
import { HorarioForm } from "./horario-form";

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
    direccion: String(valueByKey.get(STORE_SETTINGS_KEYS.direccion) ?? ""),
    frasesPromocionales: (() => {
      const raw = valueByKey.get(STORE_SETTINGS_KEYS.frasesPromocionales);
      const arr = Array.isArray(raw) ? raw.map((f) => String(f)) : [];
      return [arr[0] ?? "", arr[1] ?? "", arr[2] ?? "", arr[3] ?? ""];
    })(),
    stockBajoUmbral: Number(
      valueByKey.get(STORE_SETTINGS_KEYS.stockBajoUmbral) ?? 5,
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

  const heroStored = parseHeroStored(valueByKey.get("home_hero"));
  const bannersParsed = bannersStoredSchema.safeParse(valueByKey.get("home_banners"));
  const bannersStored = bannersParsed.success ? bannersParsed.data : [];

  const homeDefaultValues: HomeContenidoInput = {
    banner1: { link: bannersStored[0]?.link ?? "" },
    banner2: { link: bannersStored[1]?.link ?? "" },
    banner3: { link: bannersStored[2]?.link ?? "" },
  };

  const horarioParsed = horarioSchema.safeParse(valueByKey.get("horario"));
  const horarioDefaultValues = horarioParsed.success ? horarioParsed.data : horarioPorDefecto();

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Ajustes de la tienda
        </h1>
        <AjustesForm defaultValues={defaultValues} />
      </div>
      <div className="flex flex-col gap-6">
        <h2 className="font-heading text-xl text-brand-ciruela">
          Contenido del inicio
        </h2>
        <HomeContenidoForm
          defaultValues={homeDefaultValues}
          heroImagenesDesktopActuales={heroStored?.imagenesDesktop ?? []}
          heroImagenesMobileActuales={heroStored?.imagenesMobile ?? []}
          banner1ImageActual={bannersStored[0]?.imageUrl ?? null}
          banner2ImageActual={bannersStored[1]?.imageUrl ?? null}
          banner3ImageActual={bannersStored[2]?.imageUrl ?? null}
        />
      </div>
      <div className="flex flex-col gap-6">
        <h2 className="font-heading text-xl text-brand-ciruela">Horario de atención</h2>
        <HorarioForm defaultValues={horarioDefaultValues} />
      </div>
    </div>
  );
}
