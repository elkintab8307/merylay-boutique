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
