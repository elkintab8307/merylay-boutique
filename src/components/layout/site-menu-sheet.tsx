"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, Music2 } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { logout } from "@/lib/auth/logout-action";
import { destinoPorRol } from "@/lib/auth/destino-por-rol";
import type { CurrentUser } from "@/lib/auth/get-current-user";

type CategoriaConConteo = { id: string; name: string; slug: string; count: number };
type Redes = {
  whatsapp: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
};

export function SiteMenuSheet({
  nombreTienda,
  currentUser,
  categorias,
  totalProductos,
  redes,
}: {
  nombreTienda: string;
  currentUser: CurrentUser | null;
  categorias: CategoriaConConteo[];
  totalProductos: number;
  redes: Redes;
}) {
  const hayRedes = redes.whatsapp || redes.instagram || redes.tiktok || redes.facebook;
  const destino = currentUser ? destinoPorRol(currentUser.profile.role) : null;

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Menú"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-ciruela hover:bg-brand-rosa-claro/30"
      >
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-6 overflow-y-auto bg-brand-crema">
        <SheetHeader className="items-center text-center">
          <Image
            src="/brand/logo-principal.png"
            alt={nombreTienda}
            width={64}
            height={64}
            className="rounded-full"
          />
          <SheetTitle className="font-heading text-xl text-brand-ciruela">
            {nombreTienda}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-1 px-4">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
            Categorías
          </h3>
          <SheetClose
            render={
              <Link
                href="/productos"
                className="flex items-center justify-between rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
              />
            }
          >
            <span>Todos los productos</span>
            <span className="text-brand-ciruela/50">{totalProductos}</span>
          </SheetClose>
          {categorias.map((categoria) => (
            <SheetClose
              key={categoria.id}
              render={
                <Link
                  href={`/categoria/${categoria.slug}`}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                />
              }
            >
              <span>{categoria.name}</span>
              <span className="text-brand-ciruela/50">{categoria.count}</span>
            </SheetClose>
          ))}
        </div>

        <div className="flex flex-col gap-1 px-4">
          <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
            Mi cuenta
          </h3>
          {currentUser ? (
            <>
              {destino && destino !== "/" && (
                <SheetClose
                  render={
                    <Link
                      href={destino}
                      className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                    />
                  }
                >
                  Panel ({currentUser.profile.username})
                </SheetClose>
              )}
              <SheetClose
                render={
                  <Link
                    href="/cuenta"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Mi cuenta
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/cuenta/pedidos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Mis pedidos
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/favoritos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Favoritos
              </SheetClose>
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md px-3 py-2 text-left text-brand-ciruela hover:bg-brand-rosa-claro/30"
                >
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <>
              <SheetClose
                render={
                  <Link
                    href="/login"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Iniciar sesión
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/registro"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Crear cuenta
              </SheetClose>
              <SheetClose
                render={
                  <Link
                    href="/favoritos"
                    className="rounded-md px-3 py-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                  />
                }
              >
                Favoritos
              </SheetClose>
            </>
          )}
        </div>

        {hayRedes && (
          <div className="flex flex-col gap-2 px-4">
            <h3 className="mb-1 px-3 text-xs font-semibold uppercase text-brand-rosa">
              Síguenos
            </h3>
            <div className="flex flex-wrap gap-3 px-3">
              {redes.whatsapp && (
                <a
                  href={redes.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
                >
                  <Image src="/brand/whatsapp.png" alt="" width={40} height={40} />
                </a>
              )}
              {redes.instagram && (
                <a
                  href={redes.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
                >
                  <Image src="/brand/instagram.png" alt="" width={40} height={40} />
                </a>
              )}
              {redes.tiktok && (
                <a
                  href={redes.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-ciruela text-brand-crema"
                >
                  <Music2 className="h-5 w-5" />
                </a>
              )}
              {redes.facebook && (
                <a
                  href={redes.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
                >
                  <Image src="/brand/facebook.webp" alt="" width={40} height={40} />
                </a>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
