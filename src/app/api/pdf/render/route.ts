import { NextResponse, type NextRequest } from "next/server";
import { plantillaTabla, type DatosTabla } from "@/lib/pdf/plantilla-tabla";
import { plantillaTarjetas, type DatosTarjetas } from "@/lib/pdf/plantilla-tarjetas";

export const runtime = "nodejs";
export const maxDuration = 60;

type CuerpoTabla = { tipo: "tabla" } & Omit<DatosTabla, "logoUrl">;
type CuerpoTarjetas = { tipo: "tarjetas" } & Omit<DatosTarjetas, "logoUrl">;

// Forma minima que necesitamos de un navegador/pagina de Puppeteer -- se usa
// un cast a esta interfaz en vez de importar los tipos reales porque en
// desarrollo local se usa el paquete `puppeteer` (Chromium completo,
// multiplataforma) y en Vercel `puppeteer-core` + `@sparticuz/chromium`
// (binario minimo para Amazon Linux/Lambda, no corre en Windows/Mac de
// desarrollo); ambos satisfacen esta forma en tiempo de ejecucion.
interface PaginaMinima {
  setContent(html: string, opts: { waitUntil: string }): Promise<void>;
  pdf(opts: { printBackground: boolean; width: string; height: string }): Promise<Uint8Array>;
  evaluate<T>(fn: () => T): Promise<T>;
}
interface NavegadorMinimo {
  newPage(): Promise<PaginaMinima>;
  close(): Promise<void>;
}

async function lanzarNavegador(): Promise<NavegadorMinimo> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    // Desactiva WebGL/swiftshader -- recomendado por el README de
    // @sparticuz/chromium para serverless.
    chromium.setGraphicsMode = false;
    // El README de @sparticuz/chromium sugiere headless:"shell", pero en
    // el smoke test real contra Vercel (ver PR #60) esa combinacion
    // crasheaba SIEMPRE justo despues de "DevTools listening..." (Protocol
    // error: Target closed, exit status 128) -- probado con Node 22.x/24.x
    // y memoria de sobra, descartando ambas causas. headless:true (el
    // modo headless "nuevo", default de Puppeteer) es la UNICA combinacion
    // que genero un PDF real en las pruebas (tanto local como en Vercel).
    return (await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as NavegadorMinimo;
  }
  // Desarrollo local: `puppeteer` (no `puppeteer-core`) instala su propio
  // Chromium multiplataforma -- el binario de @sparticuz/chromium es
  // especifico de Amazon Linux y no corre en un equipo de desarrollo.
  const puppeteer = (await import("puppeteer")).default;
  return (await puppeteer.launch({ headless: true })) as unknown as NavegadorMinimo;
}

async function renderizarHtmlAPdf(html: string): Promise<Uint8Array> {
  const navegador = await lanzarNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: "networkidle0" });
    // Sin `height`, Puppeteer usa el alto de pagina por defecto (Letter) y
    // deja un hueco en blanco enorme debajo del contenido real -- medido en
    // la verificacion visual manual de este plan (Task 7, Step 6). Se mide
    // el alto real del documento renderizado y se usa como alto del PDF.
    const altura = await pagina.evaluate(() => document.documentElement.scrollHeight);
    return pagina.pdf({ printBackground: true, width: "1040px", height: `${altura}px` });
  } finally {
    await navegador.close();
  }
}

export async function POST(request: NextRequest) {
  // Fail-closed: mismo patron que WOMPI_EVENTS_SECRET/NOTIFICAR_PEDIDO_SECRET
  // ya usados en este repo -- sin este secreto, cualquiera podria forzar
  // renders de Chromium (costo de computo) golpeando la URL publica.
  const secretoEsperado = process.env.PDF_RENDER_SECRET;
  if (!secretoEsperado) {
    console.error("[api/pdf/render] PDF_RENDER_SECRET no esta configurado -- rechazando toda peticion.");
    return NextResponse.json({ error: "Configuracion del servidor invalida." }, { status: 500 });
  }
  const secretoRecibido = request.headers.get("x-pdf-render-secret");
  if (secretoRecibido !== secretoEsperado) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo invalido." }, { status: 400 });
  }

  const tipo = (cuerpo as { tipo?: unknown } | null)?.tipo;
  // El origen de la propia peticion (en vez de SITE_URL) evita perder el
  // logo si SITE_URL no esta configurado en Vercel -- SITE_URL es un
  // secreto de la Edge Function de Supabase, no una variable que este
  // documentada para el lado de Next.js/Vercel.
  const logoUrl = `${new URL(request.url).origin}/brand/logo-principal.png`;

  let html: string;
  if (tipo === "tabla") {
    const datos = cuerpo as CuerpoTabla;
    html = plantillaTabla({ titulo: datos.titulo, encabezados: datos.encabezados, filas: datos.filas, logoUrl });
  } else if (tipo === "tarjetas") {
    const datos = cuerpo as CuerpoTarjetas;
    html = plantillaTarjetas({
      titulo: datos.titulo,
      subtitulo: datos.subtitulo,
      fotoHeroUrl: datos.fotoHeroUrl,
      estadisticas: datos.estadisticas,
      tarjetas: datos.tarjetas,
      logoUrl,
    });
  } else {
    return NextResponse.json({ error: `tipo desconocido: ${String(tipo)}` }, { status: 400 });
  }

  try {
    const pdfBytes = await renderizarHtmlAPdf(html);
    return new NextResponse(Buffer.from(pdfBytes), { status: 200, headers: { "Content-Type": "application/pdf" } });
  } catch (error) {
    console.error("[api/pdf/render] Error renderizando el PDF:", error);
    return NextResponse.json({ error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
