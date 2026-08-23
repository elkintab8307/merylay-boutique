import type { Metadata } from "next";
import { greatVibes, playfairDisplay, montserrat, cinzel } from "@/lib/fonts";
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
      className={`${greatVibes.variable} ${playfairDisplay.variable} ${montserrat.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col touch-manipulation overflow-x-hidden bg-brand-crema font-body text-brand-ciruela">
        {children}
      </body>
    </html>
  );
}
