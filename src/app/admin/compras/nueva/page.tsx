import { createClient } from "@/lib/supabase/server";
import { CompraForm } from "../compra-form";

export default async function NuevaCompraPage() {
  const supabase = await createClient();
  const [{ data: proveedores }, { data: productos }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("products")
      .select("id, name, sku, product_variants(id, name, sku)")
      .order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Nueva compra</h1>
      <CompraForm
        proveedores={proveedores ?? []}
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          variantes: p.product_variants ?? [],
        }))}
      />
    </div>
  );
}
