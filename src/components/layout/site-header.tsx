import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
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
        <nav className="font-body text-sm text-brand-ciruela">
          <span>Inspiración Femenina</span>
        </nav>
      </div>
    </header>
  );
}
