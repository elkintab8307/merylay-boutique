"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type SidebarSection = {
  label: string;
  items: { href: string; label: string; icon?: LucideIcon }[];
};

function NavLinks({
  sections,
  currentPath,
  onNavigate,
}: {
  sections: SidebarSection[];
  currentPath: string;
  onNavigate?: (
    item: { href: string; label: string; icon?: LucideIcon },
    className: string,
    content: React.ReactNode,
  ) => React.ReactNode;
}) {
  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium tracking-wide text-brand-ciruela/50 uppercase">
            {section.label}
          </p>
          {section.items.map((item) => {
            const active = currentPath === item.href;
            const Icon = item.icon;
            const linkClassName = cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-brand-rosa/10 font-medium text-brand-rosa"
                : "text-brand-ciruela hover:bg-brand-rosa-claro/20",
            );
            const content = (
              <>
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {item.label}
              </>
            );
            if (onNavigate) {
              return <div key={item.href}>{onNavigate(item, linkClassName, content)}</div>;
            }
            return (
              <Link key={item.href} href={item.href} className={linkClassName}>
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function BackendSidebar({
  sections,
  homeHref,
}: {
  sections: SidebarSection[];
  homeHref: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-brand-rosa-claro bg-white px-4 py-6 md:flex print:hidden">
        <Link href={homeHref} className="px-3 font-script text-2xl text-brand-rosa">
          MeryLay
        </Link>
        <NavLinks sections={sections} currentPath={pathname} />
      </aside>
      <div className="border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
        <Sheet>
          <SheetTrigger
            aria-label="Menú"
            className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Menu className="h-6 w-6" />
          </SheetTrigger>
          <SheetContent side="left" className="bg-brand-crema">
            <SheetHeader>
              <SheetTitle className="font-script text-2xl text-brand-rosa">
                MeryLay
              </SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-4">
              <NavLinks
                sections={sections}
                currentPath={pathname}
                onNavigate={(item, className, content) => (
                  <SheetClose render={<Link href={item.href} />} className={className}>
                    {content}
                  </SheetClose>
                )}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
