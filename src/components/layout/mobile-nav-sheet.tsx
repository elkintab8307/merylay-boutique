"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavLink = { href: string; label: string };

export function MobileNavSheet({
  links,
  triggerLabel = "Menú",
}: {
  links: NavLink[];
  triggerLabel?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label={triggerLabel}
        className="inline-flex items-center justify-center rounded-md p-2 text-brand-ciruela hover:bg-brand-rosa-claro/30 md:hidden"
      >
        <Menu className="h-6 w-6" />
      </SheetTrigger>
      <SheetContent side="left" className="bg-brand-crema">
        <SheetHeader>
          <SheetTitle className="font-heading text-brand-ciruela">
            {triggerLabel}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          {links.map((link) => (
            <SheetClose
              key={link.href}
              render={
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-3 text-brand-ciruela hover:bg-brand-rosa-claro/30"
                />
              }
            >
              {link.label}
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
