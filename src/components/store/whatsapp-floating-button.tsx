import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { construirLinkWhatsapp } from "@/lib/whatsapp/build-whatsapp-link";

const MENSAJE_GENERICO = "Hola, quiero información sobre sus productos";

export async function WhatsappFloatingButton() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", "redes_whatsapp")
    .maybeSingle();

  const redesWhatsapp = data?.value ? String(data.value) : null;
  if (!redesWhatsapp) return null;

  return (
    <a
      href={construirLinkWhatsapp(redesWhatsapp, MENSAJE_GENERICO)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white shadow-brand-lg transition hover:scale-105"
    >
      <Image src="/brand/whatsapp.png" alt="" width={56} height={56} />
    </a>
  );
}
