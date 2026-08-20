"use client";

import { MessageCircle } from "lucide-react";
import { construirLinkWhatsapp } from "@/lib/whatsapp/build-whatsapp-link";

export function WhatsappProductButton({
  redesWhatsapp,
  productName,
}: {
  redesWhatsapp: string | null;
  productName: string;
}) {
  if (!redesWhatsapp) return null;

  const handleClick = () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    const mensaje = `Hola, estoy interesada en este producto: ${productName} — ${url}`;
    window.open(construirLinkWhatsapp(redesWhatsapp, mensaje), "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex w-fit items-center gap-2 rounded-md border border-brand-rosa-claro px-4 py-2 text-sm text-brand-ciruela transition hover:bg-brand-rosa-claro/30"
    >
      <MessageCircle className="h-4 w-4 text-brand-rosa" />
      Preguntar por WhatsApp
    </button>
  );
}
