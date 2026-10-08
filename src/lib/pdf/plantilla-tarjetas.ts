// Plantilla HTML pura para los informes con fotos del bot de WhatsApp
// (informe de productos del dueño, catalogo de clientes, cotizacion).
// Sin I/O ni acceso a variables de entorno -- ver nota en plantilla-tabla.ts.
import { escaparHtml } from "./plantilla-tabla";

export interface PillGrupo {
  etiqueta: string;
  valores: string[];
}

export interface Tarjeta {
  fotoUrl: string | null;
  nombre: string;
  pills: PillGrupo[];
  precio: number | null;
  nota?: string;
}

export interface Estadistica {
  valor: string;
  etiqueta: string;
}

export interface DatosTarjetas {
  titulo: string;
  subtitulo: string;
  fotoHeroUrl: string | null;
  estadisticas: Estadistica[];
  tarjetas: Tarjeta[];
  logoUrl: string | null;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

function pillsHtml(pills: PillGrupo[]): string {
  return pills
    .map(
      (grupo) => `
      <div class="fila-pill">
        <span class="etiqueta-pill">${escaparHtml(grupo.etiqueta)}:</span>
        ${grupo.valores.map((v) => `<span class="pill">${escaparHtml(v)}</span>`).join("")}
      </div>`,
    )
    .join("");
}

function tarjetaHtml(t: Tarjeta): string {
  const foto = t.fotoUrl
    ? `<img src="${escaparHtml(t.fotoUrl)}" class="foto-tarjeta" />`
    : `<div class="foto-tarjeta sin-foto">Sin foto</div>`;

  const precioHtml = t.precio !== null ? `<span class="precio">${formatoMoneda(t.precio)}</span>` : "";
  const notaHtml = t.nota ? `<span class="nota">${escaparHtml(t.nota)}</span>` : "";

  return `
    <div class="tarjeta">
      ${foto}
      <div class="info-tarjeta">
        <h3 class="nombre-producto">${escaparHtml(t.nombre)}</h3>
        ${pillsHtml(t.pills)}
        <div class="linea-precio">${precioHtml}${notaHtml}</div>
      </div>
    </div>`;
}

export function plantillaTarjetas(datos: DatosTarjetas): string {
  const { titulo, subtitulo, fotoHeroUrl, estadisticas, tarjetas, logoUrl } = datos;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --rosa-fuerte: #E96A9E;
    --dorado: #D9A441;
    --rosa-claro: #F8D4DD;
    --crema: #FFF8F4;
    --ciruela: #6E2A44;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; background: var(--crema); color: var(--ciruela); width: 1040px; }
  .encabezado { display: flex; align-items: center; justify-content: space-between; background: var(--rosa-claro); border-bottom: 3px solid var(--dorado); padding: 24px 32px; min-height: 150px; }
  .marca { display: flex; align-items: center; gap: 16px; }
  .logo { height: 50px; }
  .titulos h1 { font-family: 'Playfair Display', serif; font-size: 28px; color: var(--rosa-fuerte); }
  .titulos h2 { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }
  .foto-hero { width: 180px; height: 150px; object-fit: cover; border-left: 3px solid var(--dorado); }
  .stats { display: flex; background: white; }
  .stat { flex: 1; text-align: center; padding: 14px 0; border-right: 1px solid var(--dorado); }
  .stat:last-child { border-right: none; }
  .stat .valor { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--rosa-fuerte); font-weight: 700; }
  .stat .etiqueta { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
  .cuadricula { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 24px; }
  .tarjeta { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(110, 42, 68, 0.15); display: flex; flex-direction: column; }
  .foto-tarjeta { width: 100%; height: 150px; object-fit: cover; display: block; }
  .foto-tarjeta.sin-foto { background: var(--rosa-claro); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--ciruela); }
  .info-tarjeta { padding: 12px 14px; }
  .nombre-producto { font-size: 13px; font-weight: 700; color: var(--ciruela); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .fila-pill { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; font-size: 10px; }
  .etiqueta-pill { font-weight: 700; margin-right: 2px; }
  .pill { background: var(--rosa-claro); border-radius: 999px; padding: 2px 8px; font-size: 9px; }
  .linea-precio { margin-top: 6px; font-size: 12px; }
  .precio { font-weight: 700; color: var(--dorado); }
  .nota { font-size: 9px; color: var(--ciruela); margin-left: 6px; }
  footer { text-align: center; padding: 16px; font-size: 10px; color: var(--ciruela); }
</style>
</head>
<body>
  <div class="encabezado">
    <div class="marca">
      ${logoUrl ? `<img src="${escaparHtml(logoUrl)}" class="logo" />` : ""}
      <div class="titulos">
        <h1>${escaparHtml(titulo)}</h1>
        <h2>${escaparHtml(subtitulo)}</h2>
      </div>
    </div>
    ${fotoHeroUrl ? `<img src="${escaparHtml(fotoHeroUrl)}" class="foto-hero" />` : ""}
  </div>
  <div class="stats">
    ${estadisticas.map((s) => `<div class="stat"><div class="valor">${escaparHtml(s.valor)}</div><div class="etiqueta">${escaparHtml(s.etiqueta)}</div></div>`).join("")}
  </div>
  <div class="cuadricula">
    ${tarjetas.map(tarjetaHtml).join("")}
  </div>
  <footer>MeryLay Boutique — Inspiración Femenina</footer>
</body>
</html>`;
}
