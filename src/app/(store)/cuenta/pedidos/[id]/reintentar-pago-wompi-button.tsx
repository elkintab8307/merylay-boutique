"use client";

import { useState } from "react";
import { reintentarPagoWompi } from "@/app/(store)/checkout/wompi-actions";
import { WompiCheckoutButton } from "@/app/(store)/checkout/wompi-checkout-button";
import { Button } from "@/components/ui/button";

type DatosWompi = {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
};

export function ReintentarPagoWompiButton({ orderId }: { orderId: string }) {
  const [datosWompi, setDatosWompi] = useState<DatosWompi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleReintentar = async () => {
    setCargando(true);
    setError(null);

    const result = await reintentarPagoWompi(orderId);
    if ("error" in result) {
      setError(result.error);
      setCargando(false);
      return;
    }

    setDatosWompi(result);
    setCargando(false);
  };

  return (
    <div className="mb-8 rounded-lg border border-brand-oro bg-brand-rosa-claro/30 p-4">
      <h2 className="mb-1 font-heading text-base text-brand-ciruela">Pago pendiente</h2>
      <p className="mb-3 text-sm text-brand-ciruela/70">
        Este pedido aún no ha sido pagado. Puedes retomar el pago en línea cuando quieras.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {datosWompi ? (
        <WompiCheckoutButton {...datosWompi} />
      ) : (
        <Button
          type="button"
          onClick={handleReintentar}
          disabled={cargando}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {cargando ? "Preparando el pago..." : "Reintentar pago"}
        </Button>
      )}
    </div>
  );
}
