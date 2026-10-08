import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "pdf-lib";

// Paleta oficial de MeryLay Boutique (CLAUDE.md seccion 3) convertida a 0..1
// para pdf-lib (rgb() espera fracciones, no 0..255).
export const COLORES_MARCA = {
  rosaFuerte: rgb(0xe9 / 255, 0x6a / 255, 0x9e / 255),
  dorado: rgb(0xd9 / 255, 0xa4 / 255, 0x41 / 255),
  rosaClaro: rgb(0xf8 / 255, 0xd4 / 255, 0xdd / 255),
  ciruela: rgb(0x6e / 255, 0x2a / 255, 0x44 / 255),
  crema: rgb(0xff / 255, 0xf8 / 255, 0xf4 / 255),
  blanco: rgb(1, 1, 1),
};

export interface FuentesMarca {
  texto: PDFFont;
  textoNegrita: PDFFont;
  titulo: PDFFont;
}

const URL_MONTSERRAT_REGULAR = "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf";
const URL_MONTSERRAT_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf";
const URL_PLAYFAIR_BOLD = "https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-700-normal.ttf";

// `undefined` = todavia no se intento descargar; `null` = se intento y
// fallo (no reintentar en esta instancia tibia); `Uint8Array` = exito.
// El cache es de los BYTES crudos, no de la fuente ya incrustada: pdf-lib
// no permite reutilizar una fuente incrustada en un PDFDocument distinto,
// asi que cada PDF nuevo debe volver a incrustar -- lo que se evita
// repetir es la descarga por red, que es la parte cara/fragil.
let cacheMontserratRegular: Uint8Array | null | undefined;
let cacheMontserratBold: Uint8Array | null | undefined;
let cachePlayfairBold: Uint8Array | null | undefined;
let cacheLogo: Uint8Array | null | undefined;

async function descargarBytes(url: string, descripcion: string): Promise<Uint8Array | null> {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) {
      throw new Error(`respondio ${respuesta.status}`);
    }
    return new Uint8Array(await respuesta.arrayBuffer());
  } catch (error) {
    // Fail-open: un problema de red/CDN nunca debe impedir que el dueño
    // reciba su informe -- solo se pierde el detalle visual (se cae a una
    // fuente estandar o a no mostrar el logo).
    console.error(`[pdf-marca] No se pudo descargar ${descripcion}, se usa un reemplazo:`, error);
    return null;
  }
}

// Incrusta las 3 fuentes de marca (Montserrat regular/negrita para texto,
// Playfair Display negrita para titulos) en ESTE documento. Si el CDN no
// responde, cae a las fuentes estandar de pdf-lib (Helvetica) para que el
// PDF se siga generando igual.
export async function cargarFuentesMarca(pdf: PDFDocument): Promise<FuentesMarca> {
  pdf.registerFontkit(fontkit);

  if (cacheMontserratRegular === undefined) {
    cacheMontserratRegular = await descargarBytes(URL_MONTSERRAT_REGULAR, "Montserrat Regular");
  }
  if (cacheMontserratBold === undefined) {
    cacheMontserratBold = await descargarBytes(URL_MONTSERRAT_BOLD, "Montserrat Bold");
  }
  if (cachePlayfairBold === undefined) {
    cachePlayfairBold = await descargarBytes(URL_PLAYFAIR_BOLD, "Playfair Display Bold");
  }

  const texto = cacheMontserratRegular
    ? await pdf.embedFont(cacheMontserratRegular)
    : await pdf.embedFont(StandardFonts.Helvetica);
  const textoNegrita = cacheMontserratBold
    ? await pdf.embedFont(cacheMontserratBold)
    : await pdf.embedFont(StandardFonts.HelveticaBold);
  const titulo = cachePlayfairBold
    ? await pdf.embedFont(cachePlayfairBold)
    : textoNegrita;

  return { texto, textoNegrita, titulo };
}

function urlLogo(): string | null {
  const base = Deno.env.get("SITE_URL");
  return base ? `${base}/brand/logo-principal.png` : null;
}

// Incrusta el logo de la marca en ESTE documento, o null si no hay
// SITE_URL configurado o la descarga falla -- en ambos casos el llamador
// debe dibujar el encabezado sin logo en vez de fallar.
export async function cargarLogoMarca(pdf: PDFDocument): Promise<PDFImage | null> {
  if (cacheLogo === undefined) {
    const url = urlLogo();
    cacheLogo = url ? await descargarBytes(url, "el logo de la marca") : null;
  }
  if (!cacheLogo) {
    return null;
  }
  try {
    return await pdf.embedPng(cacheLogo);
  } catch (error) {
    console.error("[pdf-marca] El logo descargado no es un PNG valido, se omite:", error);
    return null;
  }
}

export function resetCachePdfMarcaParaTests(): void {
  cacheMontserratRegular = undefined;
  cacheMontserratBold = undefined;
  cachePlayfairBold = undefined;
  cacheLogo = undefined;
}

const ALTO_ENCABEZADO = 70;
const MARGEN = 24;

// Dibuja el encabezado de marca (logo + titulo + linea de acento dorada) en
// la parte superior de la pagina, y devuelve la coordenada Y a partir de la
// cual el llamador puede empezar a dibujar su propio contenido.
export function dibujarEncabezado(
  pagina: PDFPage,
  opts: { titulo: string; fuentes: FuentesMarca; logo: PDFImage | null; anchoPagina: number; altoPagina: number },
): number {
  const { titulo, fuentes, logo, anchoPagina, altoPagina } = opts;
  const yLineaAcento = altoPagina - ALTO_ENCABEZADO;

  let xTitulo = MARGEN;
  if (logo) {
    const altoLogo = 40;
    const anchoLogo = (logo.width / logo.height) * altoLogo;
    pagina.drawImage(logo, {
      x: MARGEN,
      y: altoPagina - ALTO_ENCABEZADO / 2 - altoLogo / 2,
      width: anchoLogo,
      height: altoLogo,
    });
    xTitulo = MARGEN + anchoLogo + 16;
  }

  pagina.drawText(titulo, {
    x: xTitulo,
    y: altoPagina - ALTO_ENCABEZADO / 2 - 7,
    size: 18,
    font: fuentes.titulo,
    color: COLORES_MARCA.ciruela,
  });

  pagina.drawRectangle({
    x: 0,
    y: yLineaAcento - 2,
    width: anchoPagina,
    height: 2,
    color: COLORES_MARCA.dorado,
  });

  return yLineaAcento - 24;
}

const TEXTO_PIE = "MeryLay Boutique — Inspiración Femenina";

// Dibuja el pie de pagina de marca, centrado horizontalmente.
export function dibujarPiePagina(pagina: PDFPage, opts: { fuentes: FuentesMarca; anchoPagina: number }): void {
  const anchoAprox = TEXTO_PIE.length * 4.2; // tamaño 8, Montserrat -- aproximacion suficiente para centrar
  pagina.drawText(TEXTO_PIE, {
    x: (opts.anchoPagina - anchoAprox) / 2,
    y: 16,
    size: 8,
    font: opts.fuentes.texto,
    color: COLORES_MARCA.ciruela,
  });
}

const ANCHO_PAGINA_TABLA = 780; // horizontal (landscape) -- mismo ancho que catalog.ts
const ALTO_FILA_TABLA = 20;
const MARGEN_LATERAL_TABLA = 24;
const ALTO_PIE_TABLA = 30;

// Genera un PDF de marca con una tabla simple (encabezados de columna +
// filas de texto, bandas alternadas). Sin logica de negocio: solo recibe
// texto ya formateado -- usado por los informes de negocio (reports.ts)
// y por el informe de productos sin fotos (owner-actions.ts).
export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const altoContenido = (filas.length + 1) * ALTO_FILA_TABLA;
  const altoPagina = 140 + altoContenido + ALTO_PIE_TABLA;
  const pagina = pdf.addPage([ANCHO_PAGINA_TABLA, altoPagina]);

  const [fuentes, logo] = await Promise.all([cargarFuentesMarca(pdf), cargarLogoMarca(pdf)]);
  let y = dibujarEncabezado(pagina, { titulo, fuentes, logo, anchoPagina: ANCHO_PAGINA_TABLA, altoPagina });

  const anchoColumna = (ANCHO_PAGINA_TABLA - MARGEN_LATERAL_TABLA * 2) / encabezados.length;

  pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA + 4, color: COLORES_MARCA.rosaFuerte });
  encabezados.forEach((encabezado, i) => {
    pagina.drawText(encabezado, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 10, font: fuentes.textoNegrita, color: COLORES_MARCA.blanco });
  });
  y -= ALTO_FILA_TABLA;

  filas.forEach((fila, indiceFila) => {
    if (indiceFila % 2 === 1) {
      pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA, color: COLORES_MARCA.rosaClaro });
    }
    fila.forEach((valor, i) => {
      pagina.drawText(valor, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
    });
    y -= ALTO_FILA_TABLA;
  });

  dibujarPiePagina(pagina, { fuentes, anchoPagina: ANCHO_PAGINA_TABLA });

  return pdf.save();
}
