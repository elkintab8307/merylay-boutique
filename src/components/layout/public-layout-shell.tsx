import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { TrackingPixels } from "@/components/analytics/tracking-pixels";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TrackingPixels />
      <SiteHeader />
      {children}
    </>
  );
}
