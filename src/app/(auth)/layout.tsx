import type { ReactNode } from "react";
import { PublicLayoutShell } from "@/components/layout/public-layout-shell";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicLayoutShell>{children}</PublicLayoutShell>;
}
