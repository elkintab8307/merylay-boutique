import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { logout } from "@/lib/auth/logout-action";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MobileNavSheet } from "./mobile-nav-sheet";

export async function SiteHeader() {
  const supabase = await createClient();
  const [currentUser, { data: categorias }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("categories")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <header className="border-b border-brand-rosa-claro bg-brand-crema/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/logo-principal.png"
              alt="MeryLay Boutique"
              width={40}
              height={40}
              className="rounded-full"
            />
            <span className="font-script text-3xl text-brand-rosa">
              MeryLay Boutique
            </span>
          </Link>
          <div className="flex items-center gap-4 font-body text-sm text-brand-ciruela">
            <span className="hidden sm:inline">Inspiración Femenina</span>
            <Link href="/carrito" className="hover:text-brand-rosa">
              Carrito
            </Link>
            {currentUser && (
              <Link href="/cuenta/pedidos" className="hover:text-brand-rosa">
                Mis pedidos
              </Link>
            )}
            {currentUser ? (
              <div className="flex items-center gap-3">
                <span>{currentUser.profile.username}</span>
                <form action={logout}>
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
                  >
                    Cerrar sesión
                  </Button>
                </form>
              </div>
            ) : (
              <Link href="/login">
                <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
                  Iniciar sesión
                </Button>
              </Link>
            )}
          </div>
        </div>
        {categorias && categorias.length > 0 && (
          <>
            <nav className="hidden gap-4 text-sm text-brand-ciruela md:flex">
              {categorias.map((categoria) => (
                <Link
                  key={categoria.id}
                  href={`/categoria/${categoria.slug}`}
                  className="hover:text-brand-rosa"
                >
                  {categoria.name}
                </Link>
              ))}
            </nav>
            <div className="md:hidden">
              <MobileNavSheet
                triggerLabel="Categorías"
                links={categorias.map((categoria) => ({
                  href: `/categoria/${categoria.slug}`,
                  label: categoria.name,
                }))}
              />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
