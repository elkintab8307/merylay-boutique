"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    WidgetCheckout: new (config: {
      currency: string;
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: { integrity: string };
      redirectUrl?: string;
    }) => {
      open: (
        callback: (result: { transaction?: { id: string; status: string } }) => void,
      ) => void;
    };
  }
}

export function WompiCheckoutButton({
  orderId,
  reference,
  amountInCents,
  currency,
  publicKey,
  signature,
}: {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
}) {
  const router = useRouter();
  const [scriptListo, setScriptListo] = useState(false);

  const handlePagar = () => {
    if (!window.WidgetCheckout) return;

    const checkout = new window.WidgetCheckout({
      currency,
      amountInCents,
      reference,
      publicKey,
      signature: { integrity: signature },
      redirectUrl: `${window.location.origin}/checkout/wompi/retorno?orderId=${orderId}`,
    });

    checkout.open((result) => {
      const estado = result.transaction?.status ?? "PENDING";
      router.push(`/checkout/wompi/retorno?orderId=${orderId}&estado=${estado}`);
    });
  };

  return (
    <>
      <Script src="https://checkout.wompi.co/widget.js" onLoad={() => setScriptListo(true)} />
      <Button
        type="button"
        onClick={handlePagar}
        disabled={!scriptListo}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        Pagar con Wompi
      </Button>
    </>
  );
}
