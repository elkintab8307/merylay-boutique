import Link from "next/link";

export function SuperadminNav() {
  return (
    <nav className="flex gap-4 border-b border-brand-rosa-claro bg-white px-6 py-3 font-body text-sm text-brand-ciruela">
      <Link href="/admin" className="hover:text-brand-rosa">
        Panel
      </Link>
      <Link href="/superadmin/usuarios" className="hover:text-brand-rosa">
        Usuarios
      </Link>
      <Link href="/superadmin/ajustes" className="hover:text-brand-rosa">
        Ajustes
      </Link>
    </nav>
  );
}
