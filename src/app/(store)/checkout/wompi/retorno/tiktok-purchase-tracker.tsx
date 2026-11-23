"use client";

import { useEffect } from "react";
import { trackPurchase } from "@/lib/tracking/tiktok-browser";
import { reclamarCompraParaPixel } from "./actions";

// Dispara el Purchase del navegador una sola vez por pedido pagado.
// Usa el id del pedido como event_id, el mismo que envia el servidor, para
// que TikTok deduplique si ambos llegan.
export function TikTokPurchaseTracker({ orderId }: { orderId: string }) {
  // No se cancela al desmontar: en modo estricto React ejecuta el efecto dos
  // veces, y cancelar la primera dejaria sin enviar la compra. El reclamo
  // atomico del servidor ya garantiza que solo una llamada obtenga los datos.
  useEffect(() => {
    reclamarCompraParaPixel(orderId)
      .then((compra) => {
        if (!compra) return;
        trackPurchase(compra.productos, compra.valor, compra.eventId);
      })
      .catch(() => {
        // Fail-open: el pixel nunca debe afectar la pagina de confirmacion.
      });
  }, [orderId]);

  return null;
}
