/**
 * Comprime y redimensiona una foto en el navegador ANTES de subirla a
 * Supabase Storage. Las fotos de celular llegan a pesar 5-10 MB; subir
 * varias por datos moviles es lento y fragil. Reducirlas a ~1280px y
 * re-guardarlas como JPEG deja cada archivo en unos cientos de KB.
 *
 * Regla de oro: esto es "mejor esfuerzo" y NUNCA lanza. Si el navegador
 * no puede decodificar la imagen, se queda sin memoria, o el resultado
 * saldria mas pesado, se devuelve el archivo ORIGINAL tal cual. Preferimos
 * subir una foto grande a perderla. La subida (secuencial, con reintento)
 * se encarga del resto.
 */

const LADO_MAXIMO_POR_DEFECTO = 1280;
const CALIDAD_JPEG = 0.82;
// Debajo de este tamano no vale la pena decodificar/re-encodear: el ahorro
// es minimo y el trabajo (memoria, CPU en el telefono) no se justifica.
const OMITIR_DEBAJO_DE_BYTES = 500_000;

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
  opciones: {
    ladoMaximo?: number;
    calidad?: number;
    omitirDebajoDeBytes?: number;
  } = {},
): Promise<File> {
  const ladoMaximo = opciones.ladoMaximo ?? LADO_MAXIMO_POR_DEFECTO;
  const calidad = opciones.calidad ?? CALIDAD_JPEG;
  const omitirDebajoDeBytes =
    opciones.omitirDebajoDeBytes ?? OMITIR_DEBAJO_DE_BYTES;

  if (file.size <= omitirDebajoDeBytes) {
    return file;
  }

  try {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return file;
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
        return file;
      }
      contexto.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", calidad),
      );

      // Libera el lienzo de inmediato: en moviles el backing store del
      // canvas no se recupera solo hasta el siguiente GC, y procesar
      // varias fotos seguidas agota la memoria.
      canvas.width = 0;
      canvas.height = 0;

      if (!blob || blob.size >= file.size) {
        return file;
      }

      return new File([blob], nombreComoJpg(file.name), { type: "image/jpeg" });
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}
