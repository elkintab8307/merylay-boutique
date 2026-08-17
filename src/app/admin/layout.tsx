import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AdminNav } from "./admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <AdminNav />
      <div className="flex flex-1 flex-col">
        <div className="flex justify-end border-b border-brand-rosa-claro bg-white px-6 py-3 print:hidden">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-1.5 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <ExternalLink className="h-4 w-4" />
            Ver tienda
          </Link>
        </div>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
