/**
 * Comprime y redimensiona una foto en el navegador ANTES de subirla a
 * Supabase Storage. Las fotos de celular llegan a pesar 5-10 MB; subir
 * varias en paralelo por datos moviles satura la conexion y algunas
 * subidas se caen. Reducirlas a ~1600px y re-guardarlas como JPEG deja
 * cada archivo en unos cientos de KB, y de paso normaliza formatos raros
 * (HEIC, PNG enormes) a algo que el navegador y la tienda saben mostrar.
 */

const LADO_MAXIMO_POR_DEFECTO = 1600;
const CALIDAD_JPEG = 0.82;

export function calcularDimensiones(
  width: number,
  height: number,
  ladoMaximo: number,
): { width: number; height: number } {
  const ladoMayor = Math.max(width, height);
  if (ladoMayor <= ladoMaximo) {
    return { width, height };
  }
  const factor = ladoMaximo / ladoMayor;
  return {
    width: Math.round(width * factor),
    height: Math.round(height * factor),
  };
}

function nombreComoJpg(nombre: string): string {
  const sinExtension = nombre.includes(".")
    ? nombre.slice(0, nombre.lastIndexOf("."))
    : nombre;
  return `${sinExtension}.jpg`;
}

export async function comprimirImagen(
  file: File,
  opciones: { ladoMaximo?: number; calidad?: number } = {},
): Promise<File> {
  const ladoMaximo = opciones.ladoMaximo ?? LADO_MAXIMO_POR_DEFECTO;
  const calidad = opciones.calidad ?? CALIDAD_JPEG;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      `No se pudo procesar «${file.name}» — usa una foto en formato JPG o PNG.`,
    );
  }

  try {
    const { width, height } = calcularDimensiones(
      bitmap.width,
      bitmap.height,
      ladoMaximo,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const contexto = canvas.getContext("2d");
    if (!contexto) {
      throw new Error(
        `No se pudo procesar «${file.name}» — intenta con otra foto.`,
      );
    }
    contexto.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", calidad),
    );
    if (!blob) {
      throw new Error(
        `No se pudo procesar «${file.name}» — intenta con otra foto.`,
      );
    }

    return new File([blob], nombreComoJpg(file.name), { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}
