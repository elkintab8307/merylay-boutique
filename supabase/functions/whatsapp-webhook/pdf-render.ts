// Reemplaza a pdf-marca.ts: ya no dibuja PDFs con pdf-lib -- le pide a un
// endpoint de Next.js/Vercel (Puppeteer + Chromium real) que renderice HTML
// a PDF. Mismas firmas que las funciones viejas, para que reports.ts /
// owner-actions.ts / catalog.ts no tengan que cambiar sus llamadas. Ver
// docs/superpowers/specs/2026-10-08-informes-pdf-html-puppeteer-design.md.

export interface EstadisticaTarjetas {
  valor: string;
  etiqueta: string;
}

export interface TarjetaProducto {
  fotoUrl: string | null;
  nombre: string;
  pills: { etiqueta: string; valores: string[] }[];
  precio: number | null;
  nota?: string;
}

async function llamarRenderizador(cuerpo: Record<string, unknown>): Promise<Uint8Array> {
  // Fail-closed: sin estas dos variables no hay forma segura de llamar al
  // renderizador -- nunca se manda la peticion "a ver si funciona" sin
  // secreto (quien reciba la respuesta parcial no podria distinguir un PDF
  // real de un rechazo).
  const siteUrl = Deno.env.get("SITE_URL");
  const secreto = Deno.env.get("PDF_RENDER_SECRET");
  if (!siteUrl || !secreto) {
    throw new Error("Faltan SITE_URL o PDF_RENDER_SECRET para generar el PDF.");
  }

  const respuesta = await fetch(`${siteUrl}/api/pdf/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pdf-render-secret": secreto },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text();
    throw new Error(`El renderizador de PDF respondio ${respuesta.status}: ${texto}`);
  }

  return new Uint8Array(await respuesta.arrayBuffer());
}

export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  return llamarRenderizador({ tipo: "tabla", titulo, encabezados, filas });
}

export async function generarPdfTarjetas(
  titulo: string,
  subtitulo: string,
  fotoHeroUrl: string | null,
  estadisticas: EstadisticaTarjetas[],
  tarjetas: TarjetaProducto[],
): Promise<Uint8Array> {
  return llamarRenderizador({ tipo: "tarjetas", titulo, subtitulo, fotoHeroUrl, estadisticas, tarjetas });
}
