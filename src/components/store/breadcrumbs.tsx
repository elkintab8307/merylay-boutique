import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Migas de pan"
      className="flex flex-wrap items-center gap-1 text-sm text-brand-ciruela/70"
    >
      {items.map((item, index) => (
        <span key={index} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand-rosa">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-brand-ciruela">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
