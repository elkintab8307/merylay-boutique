import Image from "next/image";
import { Music2, MapPin, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DIA_LABEL, horarioSchema, ordenarHorario } from "@/lib/validation/horario";

export async function SiteFooter() {
  const supabase = await createClient();
  const { data: settingsRows } = await supabase
    .from("store_settings")
    .select("key, value")
    .in("key", [
      "nombre_tienda",
      "direccion",
      "horario",
      "redes_instagram",
      "redes_facebook",
      "redes_tiktok",
      "redes_whatsapp",
    ]);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const nombreTienda = String(settingsByKey.get("nombre_tienda") ?? "MeryLay Boutique");
  const direccion = settingsByKey.get("direccion");
  const horarioParsed = horarioSchema.safeParse(settingsByKey.get("horario"));
  const redesWhatsapp = settingsByKey.get("redes_whatsapp");
  const redesInstagram = settingsByKey.get("redes_instagram");
  const redesTiktok = settingsByKey.get("redes_tiktok");
  const redesFacebook = settingsByKey.get("redes_facebook");

  const hayRedes = redesWhatsapp || redesInstagram || redesTiktok || redesFacebook;
  const horarioOrdenado = horarioParsed.success ? ordenarHorario(horarioParsed.data) : [];

  return (
    <footer className="mt-16 bg-brand-ciruela px-6 py-12 text-brand-crema">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <h2 className="font-heading text-2xl">{nombreTienda}</h2>

        {hayRedes && (
          <div className="flex gap-3">
            {redesWhatsapp && (
              <a
                href={String(redesWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
              >
                <Image src="/brand/whatsapp.png" alt="" width={40} height={40} />
              </a>
            )}
            {redesInstagram && (
              <a
                href={String(redesInstagram)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
              >
                <Image src="/brand/instagram.png" alt="" width={40} height={40} />
              </a>
            )}
            {redesTiktok && (
              <a
                href={String(redesTiktok)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-crema/20 text-brand-crema"
              >
                <Music2 className="h-5 w-5" />
              </a>
            )}
            {redesFacebook && (
              <a
                href={String(redesFacebook)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
              >
                <Image src="/brand/facebook.webp" alt="" width={40} height={40} />
              </a>
            )}
          </div>
        )}

        {direccion && (
          <div className="flex flex-col items-center gap-1">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-oro">
              <MapPin className="h-4 w-4" />
              Ubicación
            </p>
            <p className="text-sm">{String(direccion)}</p>
          </div>
        )}

        {horarioOrdenado.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-brand-oro">
              <Clock className="h-4 w-4" />
              Horario
            </p>
            <div className="flex flex-col gap-1 text-sm">
              {horarioOrdenado.map((dia) => (
                <div key={dia.dia} className="flex justify-between gap-6">
                  <span>{DIA_LABEL[dia.dia]}</span>
                  <span>{dia.abierto ? `${dia.desde} – ${dia.hasta}` : "Cerrado"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-brand-crema/60">
          © {new Date().getFullYear()} {nombreTienda} · Inspiración Femenina
        </p>
      </div>
    </footer>
  );
}
