// Plantilla HTML pura para los informes de tabla del bot de WhatsApp
// (ventas, gastos, clientes, creditos, abonos, productos sin fotos).
// Sin I/O ni acceso a variables de entorno: todo lo que depende del
// entorno (como logoUrl) se recibe ya resuelto desde el llamador.

const COLORES = {
  rosaFuerte: "#E96A9E",
  dorado: "#D9A441",
  rosaClaro: "#F8D4DD",
  crema: "#FFF8F4",
  ciruela: "#6E2A44",
};

export interface DatosTabla {
  titulo: string;
  encabezados: string[];
  filas: string[][];
  logoUrl: string | null;
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plantillaTabla(datos: DatosTabla): string {
  const { titulo, encabezados, filas, logoUrl } = datos;

  const filasHtml = filas
    .map(
      (fila, i) => `
    <tr class="${i % 2 === 1 ? "fila-alterna" : ""}">
      ${fila.map((valor) => `<td>${escaparHtml(valor)}</td>`).join("")}
    </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Montserrat', sans-serif; background: ${COLORES.crema}; color: ${COLORES.ciruela}; width: 1040px; }
  .encabezado { display: flex; align-items: center; gap: 16px; padding: 24px 32px; background: ${COLORES.rosaClaro}; border-bottom: 3px solid ${COLORES.dorado}; }
  .logo { height: 50px; }
  h1 { font-family: 'Playfair Display', serif; font-size: 24px; color: ${COLORES.rosaFuerte}; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${COLORES.rosaFuerte}; color: white; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; }
  td { padding: 8px 16px; font-size: 12px; border-bottom: 1px solid ${COLORES.rosaClaro}; }
  .fila-alterna { background: ${COLORES.rosaClaro}; }
  footer { text-align: center; padding: 16px; font-size: 10px; color: ${COLORES.ciruela}; }
</style>
</head>
<body>
  <div class="encabezado">
    ${logoUrl ? `<img src="${escaparHtml(logoUrl)}" class="logo" />` : ""}
    <h1>${escaparHtml(titulo)}</h1>
  </div>
  <table>
    <thead><tr>${encabezados.map((e) => `<th>${escaparHtml(e)}</th>`).join("")}</tr></thead>
    <tbody>${filasHtml}</tbody>
  </table>
  <footer>MeryLay Boutique — Inspiración Femenina</footer>
</body>
</html>`;
}
