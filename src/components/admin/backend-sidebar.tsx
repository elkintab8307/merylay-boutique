"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
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
  items: { href: string; label: string; icon?: React.ReactNode }[];
};

export type SidebarExtraItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
};

function NavLinks({
  sections,
  currentPath,
  onNavigate,
}: {
  sections: SidebarSection[];
  currentPath: string;
  onNavigate?: (
    item: { href: string; label: string; icon?: React.ReactNode },
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
            const linkClassName = cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-brand-rosa/10 font-medium text-brand-rosa"
                : "text-brand-ciruela hover:bg-brand-rosa-claro/20",
            );
            const content = (
              <>
                {item.icon}
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

const EXTRA_ITEM_CLASSNAME =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-brand-ciruela transition-colors hover:bg-brand-rosa-claro/20";

export function BackendSidebar({
  sections,
  homeHref,
  open,
  onOpenChange,
  ocultarTriggerMovil = false,
  extraItem,
}: {
  sections: SidebarSection[];
  homeHref: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ocultarTriggerMovil?: boolean;
  extraItem?: SidebarExtraItem;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-brand-rosa-claro bg-white px-4 py-6 md:flex print:hidden">
        <Link href={homeHref} className="px-3 font-script text-2xl text-brand-rosa">
          MeryLay
        </Link>
        <NavLinks sections={sections} currentPath={pathname} />
        {extraItem && (
          <button
            type="button"
            onClick={extraItem.onClick}
            className={EXTRA_ITEM_CLASSNAME}
          >
            {extraItem.icon}
            {extraItem.label}
          </button>
        )}
      </aside>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {!ocultarTriggerMovil && (
          <div className="border-b border-brand-rosa-claro bg-white px-4 py-3 md:hidden print:hidden">
            <SheetTrigger
              aria-label="Menú"
              className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
          </div>
        )}
        <SheetContent side="left" className="bg-brand-crema">
          <SheetHeader>
            <SheetTitle className="font-script text-2xl text-brand-rosa">
              MeryLay
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-2 pb-4">
            <NavLinks
              sections={sections}
              currentPath={pathname}
              onNavigate={(item, className, content) => (
                <SheetClose render={<Link href={item.href} />} className={className}>
                  {content}
                </SheetClose>
              )}
            />
            {extraItem && (
              <SheetClose
                render={<button type="button" onClick={extraItem.onClick} />}
                className={EXTRA_ITEM_CLASSNAME}
              >
                {extraItem.icon}
                {extraItem.label}
              </SheetClose>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
