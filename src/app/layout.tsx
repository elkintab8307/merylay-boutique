import type { Metadata } from "next";
import { greatVibes, playfairDisplay, montserrat } from "@/lib/fonts";
import { SiteHeader } from "@/components/layout/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeryLay Boutique — Inspiración Femenina",
  description:
    "Pijamas y ropa femenina con estilo elegante y romántico. MeryLay Boutique: Inspiración Femenina.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${greatVibes.variable} ${playfairDisplay.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-crema font-body text-brand-ciruela">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
