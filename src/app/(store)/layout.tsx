import type { ReactNode } from "react";
import { PublicLayoutShell } from "@/components/layout/public-layout-shell";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
