"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Clave de localStorage: solo recuerda que la clienta ya vio el aviso.
// Es una preferencia de conveniencia por navegador, no un registro de consentimiento.
const CLAVE = "merylay-aviso-cookies-visto";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE) !== "1") setVisible(true);
    } catch {
      // Si el navegador bloquea localStorage, mostramos el aviso en cada visita.
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function cerrar() {
    try {
      localStorage.setItem(CLAVE, "1");
    } catch {
      // Sin almacenamiento disponible, el aviso solo se oculta en esta visita.
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-brand-rosa-medio bg-brand-crema p-4 text-sm text-brand-ciruela shadow-lg md:bottom-4 md:flex-row md:items-center"
    >
      <p className="flex-1 leading-relaxed">
        Usamos cookies y herramientas de medición como el Píxel de Meta y el Píxel
        de TikTok para mejorar la tienda y medir nuestras campañas. Puedes
        desactivarlas en tu navegador. Más detalles en nuestra{" "}
        <Link href="/politica" className="text-brand-rosa underline underline-offset-2">
          Política de Privacidad
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={cerrar}
        className="shrink-0 rounded-full bg-brand-rosa px-4 py-2 font-medium text-white hover:opacity-90"
      >
        Entendido
      </button>
    </div>
  );
}
