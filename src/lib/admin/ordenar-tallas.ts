/**
 * Ordena una lista de tallas para mostrarlas de forma legible (p. ej. en
 * la tarjeta de producto del panel admin). Las tallas de letra van en su
 * secuencia real (XS < S < M < L < XL < XXL...), no alfabetica; las
 * numericas de menor a mayor; el resto al final en orden alfabetico.
 * Quita duplicados sin distinguir mayusculas/minusculas ni espacios.
 */

const SECUENCIA_LETRAS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];

// Alias comunes -> forma canonica dentro de SECUENCIA_LETRAS.
const ALIAS: Record<string, string> = {
  "2XL": "XXL",
  "3XL": "XXXL",
  "4XL": "XXXXL",
  EXTRA_SMALL: "XS",
  SMALL: "S",
  MEDIUM: "M",
  MEDIANA: "M",
  LARGE: "L",
  GRANDE: "L",
};

function canonica(talla: string): { valor: string; conocida: boolean } {
  const limpia = talla.trim();
  const arriba = limpia.toUpperCase();
  const canon = ALIAS[arriba] ?? arriba;
  if (SECUENCIA_LETRAS.includes(canon)) {
    return { valor: canon, conocida: true };
  }
  return { valor: limpia, conocida: false };
}

export function ordenarTallas(tallas: string[]): string[] {
  const vistas = new Set<string>();
  const unicas: string[] = [];
  for (const talla of tallas) {
    const { valor } = canonica(talla);
    const clave = valor.toUpperCase();
    if (valor && !vistas.has(clave)) {
      vistas.add(clave);
      unicas.push(valor);
    }
  }

  const rango = (talla: string): [number, number, string] => {
    const { valor, conocida } = canonica(talla);
    if (conocida) return [0, SECUENCIA_LETRAS.indexOf(valor), ""];
    if (/^\d+([.,]\d+)?$/.test(valor)) return [1, Number(valor.replace(",", ".")), ""];
    return [2, 0, valor.toLowerCase()];
  };

  return unicas.sort((a, b) => {
    const [ga, na, sa] = rango(a);
    const [gb, nb, sb] = rango(b);
    if (ga !== gb) return ga - gb;
    if (na !== nb) return na - nb;
    return sa.localeCompare(sb);
  });
}
