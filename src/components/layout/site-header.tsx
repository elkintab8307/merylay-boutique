import Image from "next/image";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { logout } from "@/lib/auth/logout-action";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const currentUser = await getCurrentProfile();

  return (
    <header className="border-b border-brand-rosa-claro bg-brand-crema/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/isotipo-placeholder.svg"
            alt="MeryLay Boutique"
            width={40}
            height={40}
          />
          <span className="font-script text-3xl text-brand-rosa">
            MeryLay Boutique
          </span>
        </Link>
        <nav className="flex items-center gap-4 font-body text-sm text-brand-ciruela">
          <span className="hidden sm:inline">Inspiración Femenina</span>
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
        </nav>
      </div>
    </header>
  );
}
