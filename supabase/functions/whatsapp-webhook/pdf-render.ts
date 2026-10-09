import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "pdf-lib";

// Genera los PDFs del bot directamente con pdf-lib (sin Puppeteer/Chromium,
// sin llamar a ningun endpoint de Next.js/Vercel -- ver nota de abandono en
// el PR #60: Page.printToPDF crasheaba de forma irresoluble en Vercel real).
// Adapta el patron probado del proyecto base (bioreformas): texto siempre
// acotado a un ancho maximo via clipTexto/envolverTexto, nunca drawText()
// sin limite -- eso es lo que causaba el bug original (nombres de producto
// desbordandose sobre la tarjeta vecina).

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

// Recorta `texto` por caracteres hasta que entre en `maxAncho` a `tamano`,
// agregando una elipsis -- nunca deja un drawText() sin limite. Patron
// adaptado de clipText() del proyecto base (bioreformas/pdf-builder.ts).
export function clipTexto(texto: string, maxAncho: number, fuente: PDFFont, tamano: number): string {
  if (fuente.widthOfTextAtSize(texto, tamano) <= maxAncho) {
    return texto;
  }
  const elipsis = "…";
  let recortado = texto;
  while (recortado.length > 0 && fuente.widthOfTextAtSize(`${recortado}${elipsis}`, tamano) > maxAncho) {
    recortado = recortado.slice(0, -1);
  }
  return recortado.length > 0 ? `${recortado}${elipsis}` : elipsis;
}

// Envuelve `texto` en como maximo `maxLineas` lineas que caben en `maxAncho`.
// Si las palabras no entran en esas lineas, la ultima termina en elipsis
// (via clipTexto) en vez de desbordarse. Usado para el nombre de producto en
// las tarjetas -- el bug original era un drawText() de una sola linea sin
// limite, que se escribia encima de la tarjeta vecina con nombres largos.
export function envolverTexto(texto: string, maxLineas: number, maxAncho: number, fuente: PDFFont, tamano: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) {
    return [""];
  }

  const lineas: string[] = [];
  let actual = "";
  let indice = 0;
  while (indice < palabras.length && lineas.length < maxLineas) {
    const palabra = palabras[indice];
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || fuente.widthOfTextAtSize(candidata, tamano) <= maxAncho) {
      actual = candidata;
      indice++;
    } else {
      lineas.push(actual);
      actual = "";
    }
  }
  const quedanPalabras = indice < palabras.length;
  if (actual) {
    lineas.push(actual);
  }

  const ultimo = lineas.length - 1;
  if (quedanPalabras) {
    // Quedaron palabras sin usar: la linea cabe tal cual, pero hay que
    // marcar visualmente que se corto -- clipTexto no agregaria elipsis por
    // su cuenta si el texto base ya entra en el ancho.
    lineas[ultimo] = clipTexto(`${lineas[ultimo]}…`, maxAncho, fuente, tamano);
  } else if (fuente.widthOfTextAtSize(lineas[ultimo], tamano) > maxAncho) {
    lineas[ultimo] = clipTexto(lineas[ultimo], maxAncho, fuente, tamano);
  }
  return lineas;
}

// Calcula ancho/alto/x/y para dibujar una imagen DENTRO de un area sin
// deformarla (preserva su proporcion original) y centrada -- nunca la
// agranda mas alla de su tamaño real, solo la achica si no cabe. x/y son
// relativos a la esquina inferior izquierda del area (el llamador les suma
// su propio origen). Evita el bug de `drawImage({ width, height })`
// forzando el ancho/alto del area: eso SI deforma la imagen si su
// proporcion no coincide con la del area.
export function ajustarImagenContenida(
  anchoOriginal: number,
  altoOriginal: number,
  anchoMax: number,
  altoMax: number,
): { ancho: number; alto: number; x: number; y: number } {
  const escala = Math.min(anchoMax / anchoOriginal, altoMax / altoOriginal, 1);
  const ancho = anchoOriginal * escala;
  const alto = altoOriginal * escala;
  return { ancho, alto, x: (anchoMax - ancho) / 2, y: (altoMax - alto) / 2 };
}

// Path SVG de un rectangulo de esquinas redondeadas, con (0,0) en la
// esquina superior izquierda (convencion SVG: Y crece hacia abajo).
// page.drawSvgPath() voltea el eje Y internamente, asi que dibujarlo con
// `x`/`y` = la esquina superior izquierda real en coordenadas de pdf-lib
// produce el rectangulo esperado, creciendo hacia abajo/derecha desde ahi.
function pathRectanguloRedondeado(ancho: number, alto: number, radio: number): string {
  const r = Math.max(0, Math.min(radio, ancho / 2, alto / 2));
  return `M ${r} 0 L ${ancho - r} 0 Q ${ancho} 0 ${ancho} ${r} L ${ancho} ${alto - r} Q ${ancho} ${alto} ${ancho - r} ${alto} L ${r} ${alto} Q 0 ${alto} 0 ${alto - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

// Path SVG de un corazon (viewBox 24x24), usado para la insignia decorativa
// en la esquina de cada foto de producto.
const PATH_CORAZON = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

// Insignia decorativa de corazon en la esquina superior derecha de una
// foto de producto (circulo translucido + corazon encima), como en el
// diseño de referencia del dueño.
function dibujarCorazonDecorativo(pagina: PDFPage, opts: { x: number; y: number }): void {
  const { x, y } = opts;
  pagina.drawEllipse({ x, y, xScale: 11, yScale: 11, color: COLORES_MARCA.blanco, opacity: 0.55 });
  pagina.drawSvgPath(PATH_CORAZON, {
    x: x - 7,
    y: y + 7,
    scale: 0.58,
    color: COLORES_MARCA.rosaFuerte,
  });
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
let cacheBannerInforme: Uint8Array | null | undefined;

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
    console.error(`[pdf-render] No se pudo descargar ${descripcion}, se usa un reemplazo:`, error);
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
    console.error("[pdf-render] El logo descargado no es un PNG valido, se omite:", error);
    return null;
  }
}

// Incrusta el banner de encabezado de "Informe de productos" (logo + titulo
// + foto de marca, ya compuestos en un solo PNG por diseño) en ESTE
// documento, o null si no hay SITE_URL configurado o la descarga falla --
// en ambos casos el llamador debe caer al encabezado de texto/logo anterior
// en vez de fallar.
export async function cargarBannerInforme(pdf: PDFDocument): Promise<PDFImage | null> {
  if (cacheBannerInforme === undefined) {
    const base = Deno.env.get("SITE_URL");
    const url = base ? `${base}/brand/informe-productos-banner.png` : null;
    cacheBannerInforme = url ? await descargarBytes(url, "el banner de informes de productos") : null;
  }
  if (!cacheBannerInforme) {
    return null;
  }
  try {
    return await pdf.embedPng(cacheBannerInforme);
  } catch (error) {
    console.error("[pdf-render] El banner descargado no es un PNG valido, se omite:", error);
    return null;
  }
}

export function resetCachePdfMarcaParaTests(): void {
  cacheMontserratRegular = undefined;
  cacheMontserratBold = undefined;
  cachePlayfairBold = undefined;
  cacheLogo = undefined;
  cacheBannerInforme = undefined;
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
const RELLENO_CELDA_TABLA = 8; // margen entre columnas para que clipTexto no toque la siguiente

// Genera un PDF de marca con una tabla simple (encabezados de columna +
// filas de texto, bandas alternadas). Cada celda se recorta con clipTexto()
// al ancho de su columna -- sin esto, un valor largo se dibuja encima de la
// columna vecina (el bug original reportado por el dueño). Sin logica de
// negocio: solo recibe texto ya formateado -- usado por los informes de
// negocio (reports.ts) y por el informe de productos sin fotos
// (owner-actions.ts).
export async function generarPdfTabla(titulo: string, encabezados: string[], filas: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const altoContenido = (filas.length + 1) * ALTO_FILA_TABLA;
  const altoPagina = 140 + altoContenido + ALTO_PIE_TABLA;
  const pagina = pdf.addPage([ANCHO_PAGINA_TABLA, altoPagina]);

  const [fuentes, logo] = await Promise.all([cargarFuentesMarca(pdf), cargarLogoMarca(pdf)]);
  let y = dibujarEncabezado(pagina, { titulo, fuentes, logo, anchoPagina: ANCHO_PAGINA_TABLA, altoPagina });

  const anchoColumna = (ANCHO_PAGINA_TABLA - MARGEN_LATERAL_TABLA * 2) / Math.max(encabezados.length, 1);
  const anchoMaxCelda = anchoColumna - RELLENO_CELDA_TABLA;

  pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA + 4, color: COLORES_MARCA.rosaFuerte });
  encabezados.forEach((encabezado, i) => {
    const texto = clipTexto(encabezado, anchoMaxCelda, fuentes.textoNegrita, 10);
    pagina.drawText(texto, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 10, font: fuentes.textoNegrita, color: COLORES_MARCA.blanco });
  });
  y -= ALTO_FILA_TABLA;

  filas.forEach((fila, indiceFila) => {
    if (indiceFila % 2 === 1) {
      pagina.drawRectangle({ x: 0, y: y - 4, width: ANCHO_PAGINA_TABLA, height: ALTO_FILA_TABLA, color: COLORES_MARCA.rosaClaro });
    }
    fila.forEach((valor, i) => {
      const texto = clipTexto(valor, anchoMaxCelda, fuentes.texto, 9);
      pagina.drawText(texto, { x: MARGEN_LATERAL_TABLA + i * anchoColumna, y, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
    });
    y -= ALTO_FILA_TABLA;
  });

  dibujarPiePagina(pagina, { fuentes, anchoPagina: ANCHO_PAGINA_TABLA });

  return pdf.save();
}

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

const ANCHO_PAGINA_TARJETAS = 780;
const COLUMNAS_TARJETAS = 3;
// Tope de fotos reales a incrustar por PDF -- ver el comentario en el bucle
// de la cuadricula de tarjetas (generarPdfTarjetas). Ahora que cada foto se
// pide redimensionada (urlFotoRedimensionada, ~96% menos peso/pixeles que
// el original), el costo de CPU por foto bajo mucho -- se sube el tope de
// 9 a 30 con ese margen, pero sigue siendo un tope, no una garantia: un
// catalogo MUY grande (ej. el caso real de 47 tarjetas que motivo este
// cambio) todavia puede topar.
const TOPE_FOTOS_REALES_TARJETAS = 30;
const MARGEN_TARJETAS = 24;
const ESPACIO_TARJETAS = 16;
const ALTO_FOTO_TARJETA = 150;
// Alto del encabezado cuando el banner no se pudo cargar (respaldo de
// texto/logo); con banner, el alto real sale de su propia proporcion.
const ALTO_HEADER_TARJETAS = 150;
const ALTO_CAPTION_TARJETAS = 32;
const ALTO_STATS_TARJETAS = 60;
const ALTO_PIE_TARJETAS = 30;
const LINEAS_NOMBRE_TARJETA = 2;
const ALTO_LINEA_NOMBRE_TARJETA = 14;
// Espacio reservado para el nombre del producto: hasta 2 lineas (en vez de
// 1) -- antes el nombre era un unico drawText() sin limite que se escribia
// encima de la tarjeta vecina cuando el nombre era largo. Ahora se envuelve
// en como maximo 2 lineas y se recorta con elipsis si ni asi cabe.
const ALTO_BLOQUE_NOMBRE_TARJETA = 20 + LINEAS_NOMBRE_TARJETA * ALTO_LINEA_NOMBRE_TARJETA + 8;
const ANCHO_TARJETA =
  (ANCHO_PAGINA_TARJETAS - MARGEN_TARJETAS * 2 - ESPACIO_TARJETAS * (COLUMNAS_TARJETAS - 1)) / COLUMNAS_TARJETAS;

const MARCADOR_STORAGE_PUBLICO = "/storage/v1/object/public/";
const ANCHO_TRANSFORMACION_FOTO = 400;
const ALTO_TRANSFORMACION_FOTO = 400;
const CALIDAD_TRANSFORMACION_FOTO = 70;

// Si `url` es un objeto publico de Supabase Storage, devuelve la URL
// equivalente de su endpoint de transformacion de imagenes (redimensionada
// y con menos calidad). Decodificar e incrustar una foto de celular de
// varios MB en pdf-lib tiene un costo de CPU real -- con varias fotos en un
// mismo PDF eso agotaba el presupuesto de CPU de la Edge Function ("CPU
// Time exceeded" visto en produccion). Una foto de ~400x400 pesa ~96% menos
// que el original (medido: 2.26MB -> 88KB en una foto real del catalogo).
// Si la URL no es de un bucket publico de Supabase Storage, se devuelve tal
// cual -- degrada con gracia en vez de fallar.
export function urlFotoRedimensionada(url: string): string {
  const indice = url.indexOf(MARCADOR_STORAGE_PUBLICO);
  if (indice === -1) return url;
  const base = url.slice(0, indice);
  const ruta = url.slice(indice + MARCADOR_STORAGE_PUBLICO.length);
  return `${base}/storage/v1/render/image/public/${ruta}?width=${ANCHO_TRANSFORMACION_FOTO}&height=${ALTO_TRANSFORMACION_FOTO}&resize=contain&quality=${CALIDAD_TRANSFORMACION_FOTO}`;
}

async function descargarImagen(url: string): Promise<ArrayBuffer> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`descarga respondio ${respuesta.status}`);
  return respuesta.arrayBuffer();
}

// Mismo patron de descarga+incrustacion que generarPdfConFotos (catalog.ts),
// duplicado aqui porque pdf-render.ts no depende de catalog.ts (evitar el
// import circular que ya se documento al mover generarPdfTabla).
async function embedFotoDesdeUrl(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  const urlLigera = urlFotoRedimensionada(url);
  try {
    const bytes = await descargarImagen(urlLigera);
    return url.toLowerCase().endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch (error) {
    if (urlLigera === url) {
      console.error(`[pdf-render] No se pudo incrustar la foto ${url}:`, error);
      return null;
    }
    // La transformacion de imagenes puede fallar por su cuenta (limite del
    // plan, imagen corrupta, etc.) sin que la foto original deje de servir
    // -- se reintenta una vez con el original antes de rendirse del todo.
    try {
      const bytes = await descargarImagen(url);
      return url.toLowerCase().endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch (errorOriginal) {
      console.error(`[pdf-render] No se pudo incrustar la foto ${url} (ni redimensionada ni original):`, errorOriginal);
      return null;
    }
  }
}

const ALTO_PILL = 18;
const RADIO_PILL = ALTO_PILL / 2;

// Una insignia tipo "pill" de verdad: extremos semicirculares (dos
// drawEllipse) + un rectangulo central, ajustada al ancho REAL del texto
// (widthOfTextAtSize, no una aproximacion). Antes era un rectangulo de
// esquina recta -- drawRectangle no tiene esquinas redondeadas nativas en
// pdf-lib. Devuelve el ancho dibujado para que el llamador avance el
// cursor X.
function dibujarPill(pagina: PDFPage, opts: { x: number; y: number; texto: string; fuente: PDFFont }): number {
  const ancho = Math.max(opts.fuente.widthOfTextAtSize(opts.texto, 9) + 16, ALTO_PILL);
  const yCentro = opts.y + ALTO_PILL / 2;
  pagina.drawEllipse({ x: opts.x + RADIO_PILL, y: yCentro, xScale: RADIO_PILL, yScale: RADIO_PILL, color: COLORES_MARCA.rosaClaro });
  pagina.drawEllipse({ x: opts.x + ancho - RADIO_PILL, y: yCentro, xScale: RADIO_PILL, yScale: RADIO_PILL, color: COLORES_MARCA.rosaClaro });
  pagina.drawRectangle({ x: opts.x + RADIO_PILL, y: opts.y, width: ancho - ALTO_PILL, height: ALTO_PILL, color: COLORES_MARCA.rosaClaro });
  pagina.drawText(opts.texto, { x: opts.x + 8, y: opts.y + 5, size: 9, font: opts.fuente, color: COLORES_MARCA.ciruela });
  return ancho;
}

async function dibujarTarjetaProducto(
  pdf: PDFDocument,
  pagina: PDFPage,
  tarjeta: TarjetaProducto,
  opts: { x: number; yTop: number; ancho: number; altoTarjeta: number; fuentes: FuentesMarca },
): Promise<void> {
  const { x, yTop, ancho, altoTarjeta, fuentes } = opts;

  const foto = tarjeta.fotoUrl ? await embedFotoDesdeUrl(pdf, tarjeta.fotoUrl) : null;
  if (foto) {
    pagina.drawRectangle({ x, y: yTop - ALTO_FOTO_TARJETA, width: ancho, height: ALTO_FOTO_TARJETA, color: COLORES_MARCA.rosaClaro });
    const area = ajustarImagenContenida(foto.width, foto.height, ancho, ALTO_FOTO_TARJETA);
    pagina.drawImage(foto, { x: x + area.x, y: yTop - ALTO_FOTO_TARJETA + area.y, width: area.ancho, height: area.alto });
  } else {
    pagina.drawRectangle({ x, y: yTop - ALTO_FOTO_TARJETA, width: ancho, height: ALTO_FOTO_TARJETA, color: COLORES_MARCA.rosaClaro });
    const textoVacio = "Sin foto";
    const anchoTexto = fuentes.texto.widthOfTextAtSize(textoVacio, 10);
    pagina.drawText(textoVacio, { x: x + ancho / 2 - anchoTexto / 2, y: yTop - ALTO_FOTO_TARJETA / 2, size: 10, font: fuentes.texto, color: COLORES_MARCA.ciruela });
  }
  dibujarCorazonDecorativo(pagina, { x: x + ancho - 22, y: yTop - 22 });

  let y = yTop - ALTO_FOTO_TARJETA - 20;
  const anchoMaxNombre = ancho - 20;
  const lineasNombre = envolverTexto(tarjeta.nombre, LINEAS_NOMBRE_TARJETA, anchoMaxNombre, fuentes.textoNegrita, 12);
  lineasNombre.forEach((linea, i) => {
    pagina.drawText(linea, { x: x + 10, y: y - i * ALTO_LINEA_NOMBRE_TARJETA, size: 12, font: fuentes.textoNegrita, color: COLORES_MARCA.ciruela });
  });
  y -= LINEAS_NOMBRE_TARJETA * ALTO_LINEA_NOMBRE_TARJETA + 8;

  for (const grupo of tarjeta.pills) {
    const etiquetaTexto = `${grupo.etiqueta}:`;
    pagina.drawText(etiquetaTexto, { x: x + 10, y: y + 5, size: 9, font: fuentes.textoNegrita, color: COLORES_MARCA.ciruela });
    let xPill = x + 10 + fuentes.textoNegrita.widthOfTextAtSize(etiquetaTexto, 9) + 8;
    for (const valor of grupo.valores) {
      if (xPill > x + ancho - 20) break; // evita desbordar la tarjeta
      const anchoPill = dibujarPill(pagina, { x: xPill, y, texto: valor, fuente: fuentes.texto });
      xPill += anchoPill + 4;
    }
    y -= 24;
  }

  if (tarjeta.precio !== null) {
    const textoPrecio = `$${tarjeta.precio.toLocaleString("es-CO")}`;
    pagina.drawText(textoPrecio, { x: x + 10, y, size: 12, font: fuentes.textoNegrita, color: COLORES_MARCA.dorado });
    if (tarjeta.nota) {
      const anchoPrecio = fuentes.textoNegrita.widthOfTextAtSize(textoPrecio, 12);
      const anchoMaxNota = ancho - 10 - anchoPrecio - 10 - 10;
      const textoNota = clipTexto(tarjeta.nota, Math.max(anchoMaxNota, 20), fuentes.texto, 9);
      pagina.drawText(textoNota, { x: x + 10 + anchoPrecio + 10, y, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
    }
  } else if (tarjeta.nota) {
    const textoNota = clipTexto(tarjeta.nota, ancho - 20, fuentes.texto, 9);
    pagina.drawText(textoNota, { x: x + 10, y, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
  }

  pagina.drawSvgPath(pathRectanguloRedondeado(ancho, altoTarjeta, 10), { x, y: yTop, borderColor: COLORES_MARCA.dorado, borderWidth: 1 });
}

// Genera un PDF de marca con un encabezado grande (el banner de "Informe de
// productos": logo + titulo + foto de marca, compuestos en una sola imagen
// por diseño -- ver cargarBannerInforme), una franja con el subtitulo real
// del documento (el unico dato que SI cambia por informe, ej. la categoria
// cuando se separa por categoria), una banda de estadisticas, y una
// cuadricula de tarjetas de producto (foto + nombre + insignias + precio).
// Usado por los informes con fotos (informe de productos del dueño, catalogo
// de clientes, cotizacion) via sus propios llamadores en
// catalog.ts/owner-actions.ts, que adaptan sus datos a TarjetaProducto[].
export async function generarPdfTarjetas(
  titulo: string,
  subtitulo: string,
  estadisticas: EstadisticaTarjetas[],
  tarjetas: TarjetaProducto[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const filas = Math.max(Math.ceil(tarjetas.length / COLUMNAS_TARJETAS), 1);
  const maxPills = tarjetas.reduce((max, t) => Math.max(max, t.pills.length), 0);
  const altoTarjeta = ALTO_FOTO_TARJETA + ALTO_BLOQUE_NOMBRE_TARJETA + maxPills * 24 + 16;
  const altoContenido = filas * altoTarjeta + (filas - 1) * ESPACIO_TARJETAS;

  const [fuentes, logo, banner] = await Promise.all([cargarFuentesMarca(pdf), cargarLogoMarca(pdf), cargarBannerInforme(pdf)]);
  // El banner ya trae su propio logo/titulo/foto incrustados en el diseño
  // -- se dibuja a todo el ancho de la pagina, respetando su proporcion
  // real (nunca estirado). Si no se pudo cargar (SITE_URL sin configurar,
  // CDN caido), se cae al encabezado de texto/logo anterior en vez de
  // dejar la pagina sin encabezado.
  const altoBanner = banner ? (ANCHO_PAGINA_TARJETAS * banner.height) / banner.width : ALTO_HEADER_TARJETAS;

  const altoPagina = altoBanner + ALTO_CAPTION_TARJETAS + ALTO_STATS_TARJETAS + MARGEN_TARJETAS + altoContenido + MARGEN_TARJETAS + ALTO_PIE_TARJETAS;
  const pagina = pdf.addPage([ANCHO_PAGINA_TARJETAS, altoPagina]);

  pagina.drawRectangle({ x: 0, y: 0, width: ANCHO_PAGINA_TARJETAS, height: altoPagina, color: COLORES_MARCA.crema });

  // --- Encabezado: banner, o el titulo/logo de texto como respaldo ---
  const yHeaderTop = altoPagina;
  if (banner) {
    pagina.drawImage(banner, { x: 0, y: yHeaderTop - altoBanner, width: ANCHO_PAGINA_TARJETAS, height: altoBanner });
  } else {
    pagina.drawRectangle({ x: 0, y: yHeaderTop - altoBanner, width: ANCHO_PAGINA_TARJETAS, height: altoBanner, color: COLORES_MARCA.rosaClaro });
    let xTitulo = MARGEN_TARJETAS;
    if (logo) {
      const altoLogo = 50;
      const anchoLogo = (logo.width / logo.height) * altoLogo;
      pagina.drawImage(logo, { x: MARGEN_TARJETAS, y: yHeaderTop - altoBanner / 2 - altoLogo / 2, width: anchoLogo, height: altoLogo });
      xTitulo = MARGEN_TARJETAS + anchoLogo + 20;
    }
    pagina.drawText(titulo, { x: xTitulo, y: yHeaderTop - altoBanner / 2 + 5, size: 26, font: fuentes.titulo, color: COLORES_MARCA.rosaFuerte });
  }

  // --- Franja de subtitulo (el dato real y variable del documento) ---
  const yCaptionTop = yHeaderTop - altoBanner;
  pagina.drawRectangle({ x: 0, y: yCaptionTop - ALTO_CAPTION_TARJETAS, width: ANCHO_PAGINA_TARJETAS, height: ALTO_CAPTION_TARJETAS, color: COLORES_MARCA.rosaClaro });
  const subtituloRecortado = clipTexto(subtitulo, ANCHO_PAGINA_TARJETAS - MARGEN_TARJETAS * 2, fuentes.textoNegrita, 12);
  pagina.drawText(subtituloRecortado, { x: MARGEN_TARJETAS, y: yCaptionTop - ALTO_CAPTION_TARJETAS / 2 - 4, size: 12, font: fuentes.textoNegrita, color: COLORES_MARCA.ciruela });
  pagina.drawRectangle({ x: 0, y: yCaptionTop - ALTO_CAPTION_TARJETAS - 2, width: ANCHO_PAGINA_TARJETAS, height: 2, color: COLORES_MARCA.dorado });

  // --- Banda de estadisticas ---
  const yStatsTop = yCaptionTop - ALTO_CAPTION_TARJETAS;
  pagina.drawRectangle({ x: 0, y: yStatsTop - ALTO_STATS_TARJETAS, width: ANCHO_PAGINA_TARJETAS, height: ALTO_STATS_TARJETAS, color: COLORES_MARCA.blanco });
  if (estadisticas.length > 0) {
    const anchoBloque = ANCHO_PAGINA_TARJETAS / estadisticas.length;
    estadisticas.forEach((stat, i) => {
      const xBloque = i * anchoBloque;
      const centro = xBloque + anchoBloque / 2;
      const anchoValor = fuentes.titulo.widthOfTextAtSize(stat.valor, 20);
      pagina.drawText(stat.valor, { x: centro - anchoValor / 2, y: yStatsTop - 26, size: 20, font: fuentes.titulo, color: COLORES_MARCA.rosaFuerte });
      const anchoEtiqueta = fuentes.texto.widthOfTextAtSize(stat.etiqueta, 9);
      pagina.drawText(stat.etiqueta, { x: centro - anchoEtiqueta / 2, y: yStatsTop - 44, size: 9, font: fuentes.texto, color: COLORES_MARCA.ciruela });
      if (i > 0) {
        pagina.drawRectangle({ x: xBloque, y: yStatsTop - ALTO_STATS_TARJETAS + 10, width: 1, height: ALTO_STATS_TARJETAS - 20, color: COLORES_MARCA.dorado });
      }
    });
  }

  // --- Cuadricula de tarjetas ---
  // Mas alla de TOPE_FOTOS_REALES_TARJETAS, la tarjeta se dibuja SIN
  // incrustar su foto (precio/talla/stock si se muestran) -- descargar y
  // decodificar cada foto real tiene un costo de CPU real, y con catalogos
  // grandes (ahora una tarjeta por talla, no por estilo) sumaba mas CPU de
  // la que la Edge Function tiene de presupuesto, matando la funcion a
  // medio generar el PDF ("CPU Time exceeded" en los logs de Supabase, el
  // dueño se quedaba sin respuesta del bot).
  let yTarjetaTop = yStatsTop - ALTO_STATS_TARJETAS - MARGEN_TARJETAS;
  for (let i = 0; i < tarjetas.length; i++) {
    const columna = i % COLUMNAS_TARJETAS;
    if (columna === 0 && i > 0) yTarjetaTop -= altoTarjeta + ESPACIO_TARJETAS;
    const xTarjeta = MARGEN_TARJETAS + columna * (ANCHO_TARJETA + ESPACIO_TARJETAS);
    const tarjeta = i < TOPE_FOTOS_REALES_TARJETAS ? tarjetas[i] : { ...tarjetas[i], fotoUrl: null };
    await dibujarTarjetaProducto(pdf, pagina, tarjeta, { x: xTarjeta, yTop: yTarjetaTop, ancho: ANCHO_TARJETA, altoTarjeta, fuentes });
  }

  dibujarPiePagina(pagina, { fuentes, anchoPagina: ANCHO_PAGINA_TARJETAS });

  return pdf.save();
}
