import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TrackingPixels } from "@/components/analytics/tracking-pixels";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TrackingPixels />
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}
