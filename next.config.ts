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
  // El tracer de archivos de Next (@vercel/nft) no sigue el symlink de pnpm
  // hacia el binario comprimido de Chromium (@sparticuz/chromium/bin/*.br),
  // asi que la funcion serverless de /api/pdf/render se desplegaba sin ese
  // binario ("input directory .../bin does not exist" en runtime, visto en
  // el smoke test de Vercel del 2026-10-08). Se fuerza su inclusion
  // explicita -- ver https://github.com/Sparticuz/chromium#bundler-configuration.
  // Solo el patron del symlink -- el glob extra hacia adentro de
  // node_modules/.pnpm (probado junto con @sparticuz/chromium@148.0.0)
  // hizo que Vercel rechazara el build de @sparticuz/chromium@131.0.1 con
  // "produces files in symlinked directories" (ver PR #60). El patron del
  // symlink solo ya demostro ser suficiente (funciono con la 148.0.0).
  outputFileTracingIncludes: {
    "/api/pdf/render": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
