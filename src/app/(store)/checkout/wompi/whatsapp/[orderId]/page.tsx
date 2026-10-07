import { WompiCheckoutButton } from "../../../wompi-checkout-button";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ ref?: string; amount?: string; currency?: string; sig?: string }>;
}) {
  const { orderId } = await params;
  const { ref, amount, currency, sig } = await searchParams;
  const publicKey = process.env.WOMPI_PUBLIC_KEY;

  if (!ref || !amount || !currency || !sig || !publicKey) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-brand-ciruela">
        El pago en línea no está disponible en este momento. Por favor contáctanos para coordinar el pago.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="font-serif text-2xl text-brand-ciruela">Completa tu pago</h1>
      <p className="text-brand-ciruela/80">Pedido {ref}</p>
      <WompiCheckoutButton
        orderId={orderId}
        reference={ref}
        amountInCents={Number(amount)}
        currency={currency}
        publicKey={publicKey}
        signature={sig}
      />
    </div>
  );
}
