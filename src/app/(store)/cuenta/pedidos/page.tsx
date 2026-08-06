import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

export default async function PedidosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/cuenta/pedidos");
  }

  const { data: pedidos } = await supabase
    .from("orders")
    .select("id, order_number, status, total, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Mis pedidos</h1>
      {pedidos && pedidos.length > 0 ? (
        <div className="flex flex-col divide-y divide-brand-rosa-claro">
          {pedidos.map((pedido) => (
            <Link
              key={pedido.id}
              href={`/cuenta/pedidos/${pedido.id}`}
              className="flex items-center justify-between py-4 hover:text-brand-rosa"
            >
              <div>
                <p className="font-body text-brand-ciruela">{pedido.order_number}</p>
                <p className="text-xs text-brand-ciruela/60">
                  {new Date(pedido.created_at).toLocaleDateString("es-CO")} ·{" "}
                  {pedido.status}
                </p>
              </div>
              <span className="font-heading text-brand-rosa">
                {formatPrice(pedido.total)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no tienes pedidos.</p>
      )}
    </main>
  );
}
