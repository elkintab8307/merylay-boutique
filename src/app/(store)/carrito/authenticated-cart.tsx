import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CartItemControls } from "./cart-item-controls";

export type CartItemView = {
  id: string;
  name: string;
  slug: string;
  variantLabel: string | null;
  qty: number;
  unitPrice: number;
};

export function AuthenticatedCart({ items }: { items: CartItemView[] }) {
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Tu carrito está vacío.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 py-4">
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              {item.variantLabel && (
                <p className="text-xs text-brand-ciruela/60">{item.variantLabel}</p>
              )}
              <p className="text-sm text-brand-rosa">{formatPrice(item.unitPrice)}</p>
            </div>
            <CartItemControls cartItemId={item.id} qty={item.qty} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-brand-rosa-claro pt-4">
        <span className="font-heading text-lg text-brand-ciruela">Subtotal</span>
        <span className="font-heading text-xl text-brand-rosa">{formatPrice(subtotal)}</span>
      </div>
      <Link href="/checkout">
        <Button className="w-full bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
          Proceder al pago
        </Button>
      </Link>
    </div>
  );
}
