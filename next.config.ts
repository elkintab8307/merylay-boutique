import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: "https",
            hostname: supabaseHostname,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    // La cuota de optimizacion de imagenes de Vercel se agoto (402
    // OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED en /_next/image), lo que
    // rompia TODAS las imagenes del sitio (producto y logo). Mientras no
    // se actualice el plan, se sirven sin pasar por el optimizador.
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // 8mb se quedaba corto para "varias" fotos de celular (3-8MB cada
      // una); con esto y el aviso previo en el cliente (ver
      // MAX_IMAGENES_MB en producto-form.tsx) queda margen razonable
      // sin abrir la puerta a subidas sin control.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
