import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const MENSAJES_ESTADO: Record<string, string> = {
  APPROVED: "¡Tu pago fue aprobado! Estamos confirmando tu pedido.",
  DECLINED: "Tu pago fue rechazado. Puedes intentar de nuevo o elegir otro método.",
  VOIDED: "Tu pago fue anulado.",
  ERROR: "Ocurrió un error al procesar tu pago.",
  PENDING: "Tu pago está siendo procesado. Te avisaremos cuando se confirme.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WompiRetornoPage({
  searchParams,
}: PageProps) {
  const { orderId, estado } = await searchParams;
  const supabase = await createClient();

  const { data: pedido } =
    typeof orderId === "string"
      ? await supabase
          .from("orders")
          .select("id, order_number, status, total")
          .eq("id", orderId)
          .single()
      : { data: null };

  const mensaje = typeof estado === "string" ? MENSAJES_ESTADO[estado] : undefined;

  return (
    <main className="mx-auto max-w-xl px-6 py-12 text-center">
      <h1 className="mb-4 font-heading text-3xl text-brand-ciruela">
        {pedido ? `Pedido ${pedido.order_number}` : "Pago con Wompi"}
      </h1>
      <p className="mb-6 text-brand-ciruela/80">
        {mensaje ?? "Estamos confirmando el estado de tu pago."}
      </p>
      {pedido && (
        <p className="mb-6 text-sm text-brand-ciruela/60">
          Estado actual del pedido: <strong>{pedido.status}</strong>
        </p>
      )}
      <Link href="/cuenta/pedidos" className="text-brand-rosa hover:underline">
        Ver mis pedidos
      </Link>
    </main>
  );
}
