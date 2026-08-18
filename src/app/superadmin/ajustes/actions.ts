"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { createClient } from "@/lib/supabase/server";
import {
  STORE_SETTINGS_KEYS,
  storeSettingsSchema,
  type StoreSettingsInput,
} from "@/lib/validation/store-settings";
import {
  homeContenidoSchema,
  type HomeContenidoInput,
  type BannerContenido,
} from "@/lib/validation/home-contenido";
import { subirImagenBanner } from "@/lib/admin/upload-banner-image";
import { horarioSchema, type Horario } from "@/lib/validation/horario";

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

export async function guardarContenidoHome(
  input: HomeContenidoInput,
  heroImageFile: File | null,
  heroMobileImageFile: File | null,
  banner1ImageFile: File | null,
  banner2ImageFile: File | null,
  heroImageActual: string | null,
  heroMobileImageActual: string | null,
  banner1ImageActual: string | null,
  banner2ImageActual: string | null,
): Promise<{ error?: string }> {
  await requireSuperadmin();

  const parsed = homeContenidoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  let heroImageUrl = heroImageActual;
  if (heroImageFile) {
    const uploadResult = await subirImagenBanner(heroImageFile, "hero");
    if (uploadResult.error) return { error: uploadResult.error };
    heroImageUrl = uploadResult.url ?? heroImageActual;
  }

  let heroMobileImageUrl = heroMobileImageActual;
  if (heroMobileImageFile) {
    const uploadResult = await subirImagenBanner(heroMobileImageFile, "hero-movil");
    if (uploadResult.error) return { error: uploadResult.error };
    heroMobileImageUrl = uploadResult.url ?? heroMobileImageActual;
  }

  let banner1ImageUrl = banner1ImageActual;
  if (banner1ImageFile) {
    const uploadResult = await subirImagenBanner(banner1ImageFile, "banner1");
    if (uploadResult.error) return { error: uploadResult.error };
    banner1ImageUrl = uploadResult.url ?? banner1ImageActual;
  }

  let banner2ImageUrl = banner2ImageActual;
  if (banner2ImageFile) {
    const uploadResult = await subirImagenBanner(banner2ImageFile, "banner2");
    if (uploadResult.error) return { error: uploadResult.error };
    banner2ImageUrl = uploadResult.url ?? banner2ImageActual;
  }

  const banners: BannerContenido[] = [
    parsed.data.banner1.titulo || banner1ImageUrl
      ? {
          imageUrl: banner1ImageUrl,
          titulo: parsed.data.banner1.titulo,
          link: parsed.data.banner1.link,
        }
      : null,
    parsed.data.banner2.titulo || banner2ImageUrl
      ? {
          imageUrl: banner2ImageUrl,
          titulo: parsed.data.banner2.titulo,
          link: parsed.data.banner2.link,
        }
      : null,
  ].filter((b): b is BannerContenido => b !== null);

  const supabase = await createClient();
  const { error } = await supabase.from("store_settings").upsert(
    [
      {
        key: "home_hero",
        value: {
          imageUrl: heroImageUrl,
          imageUrlMobile: heroMobileImageUrl,
          ...parsed.data.hero,
        },
      },
      { key: "home_banners", value: banners },
    ],
    { onConflict: "key" },
  );

  if (error) {
    return { error: "No se pudo guardar el contenido de inicio." };
  }

  revalidatePath("/superadmin/ajustes");
  revalidatePath("/");
  return {};
}

export async function guardarHorario(horario: Horario): Promise<{ error?: string }> {
  await requireSuperadmin();

  const parsed = horarioSchema.safeParse(horario);
  if (!parsed.success) {
    return { error: "Revisa los datos del horario." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .upsert({ key: "horario", value: parsed.data }, { onConflict: "key" });

  if (error) {
    return { error: "No se pudo guardar el horario." };
  }

  revalidatePath("/superadmin/ajustes");
  revalidatePath("/");
  return {};
}
