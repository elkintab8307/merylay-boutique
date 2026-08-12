"use client";

import { useEffect, useState } from "react";
import { getLocalCart, CART_UPDATED_EVENT } from "@/lib/cart/local-cart";

export function CartBadge({
  initialCount,
  currentUserId,
}: {
  initialCount: number;
  currentUserId: string | null;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (currentUserId) return;

    const actualizarConteo = () => {
      setCount(getLocalCart().reduce((sum, item) => sum + item.qty, 0));
    };

    // Un invitado no tiene carrito en el servidor; el conteo real
    // vive en localStorage y solo se conoce tras montar en el navegador.
    actualizarConteo();
    window.addEventListener(CART_UPDATED_EVENT, actualizarConteo);
    return () => window.removeEventListener(CART_UPDATED_EVENT, actualizarConteo);
  }, [currentUserId]);

  if (count <= 0) return null;

  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-rosa px-1 text-[10px] font-semibold text-brand-crema">
      {count > 99 ? "99+" : count}
    </span>
  );
}
