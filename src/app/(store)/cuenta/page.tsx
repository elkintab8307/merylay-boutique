import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { calcularTotalPagado } from "@/lib/store/total-pagado";
import { PerfilForm } from "./perfil-form";
import { ResenaClienteForm } from "./resena-form";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?redirectTo=/cuenta");
  }

  const [{ data: profile }, { data: pedidos }, { data: resena }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, whatsapp, address, username")
        .eq("id", user.id)
        .single(),
      supabase.from("orders").select("status, total").eq("user_id", user.id),
      supabase
        .from("reviews")
        .select("rating, body")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const totalPagado = calcularTotalPagado(pedidos ?? []);
  const cantidadPedidos = pedidos?.length ?? 0;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Mi cuenta</h1>

      <section className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-6 shadow-brand-sm">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-ciruela/60">
              Pedidos realizados
            </p>
            <p className="font-heading text-2xl text-brand-ciruela">
              {cantidadPedidos}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-brand-ciruela/60">
              Total pagado
            </p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(totalPagado)}
            </p>
          </div>
        </div>
        <Link href="/cuenta/pedidos" className="text-sm text-brand-rosa hover:underline">
          Ver mis pedidos →
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">Mis datos</h2>
        {profile?.username && (
          <p className="text-sm text-brand-ciruela/70">
            Tu usuario para iniciar sesión: <strong>{profile.username}</strong>
          </p>
        )}
        <PerfilForm
          defaultValues={{
            fullName: profile?.full_name ?? "",
            whatsapp: profile?.whatsapp ?? "",
            address: profile?.address ?? "",
          }}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-xl text-brand-ciruela">
          {resena ? "Mi reseña" : "Deja tu reseña"}
        </h2>
        <ResenaClienteForm
          defaultValues={{
            rating: resena?.rating ?? 0,
            body: resena?.body ?? "",
          }}
          yaTieneResena={Boolean(resena)}
        />
      </section>
    </main>
  );
}
