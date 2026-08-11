import Link from "next/link";
import { MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

const ENLACES = [
  { href: "/admin", label: "Panel" },
  { href: "/superadmin/usuarios", label: "Usuarios" },
  { href: "/superadmin/ajustes", label: "Ajustes" },
];

export function SuperadminNav() {
  return (
    <nav className="flex items-center gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <div className="md:hidden">
        <MobileNavSheet links={ENLACES} />
      </div>
      <div className="hidden gap-4 md:flex">
        {ENLACES.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="hover:text-brand-rosa"
          >
            {enlace.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
