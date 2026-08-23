import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PromoBar } from "@/components/layout/promo-bar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { TrackingPixels } from "@/components/analytics/tracking-pixels";
import { WhatsappFloatingButton } from "@/components/store/whatsapp-floating-button";

export function PublicLayoutShell({ children }: { children: ReactNode }) {
  return (
    <>
      <TrackingPixels />
      <div className="sticky top-0 z-40">
        <PromoBar />
        <SiteHeader />
      </div>
      <div className="flex-1 pb-16 md:pb-0">{children}</div>
      <SiteFooter />
      <WhatsappFloatingButton />
      <MobileBottomNav />
    </>
  );
}
