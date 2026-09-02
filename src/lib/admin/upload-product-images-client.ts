import { createClient } from "@/lib/supabase/client";
import { comprimirImagen } from "./comprimir-imagen";

/**
 * Sube uno o mas archivos directo desde el navegador al bucket
 * "product-images" (RLS ya restringe la escritura a admin/superadmin).
 * A diferencia de subir los archivos crudos en el body de una Server
 * Action, esto evita el limite de payload (~4.5MB) de las funciones
 * serverless de Vercel.
 *
 * Las subidas van UNA POR UNA (no en paralelo): por datos moviles,
 * varias fotos pesadas a la vez saturan la conexion y algunas se caen.
 * Cada foto se comprime (mejor esfuerzo; si falla se sube la original) y
 * se reintenta hasta MAX_INTENTOS veces ante fallo de red. Entre imagen e
 * imagen hay una pausa corta para que el navegador libere memoria. El
 * callback `onEstado` permite pintar el progreso por imagen en el
 * formulario (spinner / chulo verde / X roja).
 */

const MAX_INTENTOS = 3;
const ESPERA_REINTENTO_MS = 800;
const PAUSA_ENTRE_IMAGENES_MS = 150;

export type EstadoImagen = "comprimiendo" | "subiendo" | "ok" | "error";

export type ResultadoSubida = {
  /** URLs publicas de las imagenes subidas, en el mismo orden en que
   *  aparecen los archivos exitosos dentro de `files`. */
  urls: string[];
  /** Un item por archivo que no se pudo subir. Incluye la referencia al
   *  `File` para que quien llama pueda emparejar sin depender del nombre. */
  fallos: { file: File; nombre: string; motivo: string }[];
};

type Opciones = {
  esperaReintentoMs?: number;
  pausaEntreImagenesMs?: number;
  onEstado?: (
    file: File,
    estado: EstadoImagen,
    detalle?: { url?: string; motivo?: string },
  ) => void;
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function subirImagenesProductoCliente(
  files: File[],
  opciones: Opciones = {},
): Promise<ResultadoSubida> {
  const esperaReintentoMs = opciones.esperaReintentoMs ?? ESPERA_REINTENTO_MS;
  const pausaEntreImagenesMs =
    opciones.pausaEntreImagenesMs ?? PAUSA_ENTRE_IMAGENES_MS;
  const onEstado = opciones.onEstado;

  const urls: string[] = [];
  const fallos: { file: File; nombre: string; motivo: string }[] = [];

  const supabase = createClient();
  const bucket = supabase.storage.from("product-images");

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    onEstado?.(file, "comprimiendo");
    const preparada = await comprimirImagen(file);

    onEstado?.(file, "subiendo");
    const extension = preparada.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${extension}`;

    let ultimoMotivo = "No se pudo subir la imagen.";
    let subida = false;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const { error: uploadError } = await bucket.upload(path, preparada);
      if (!uploadError) {
        subida = true;
        break;
      }
      ultimoMotivo = uploadError.message || ultimoMotivo;
      if (intento < MAX_INTENTOS) {
        await esperar(esperaReintentoMs * intento);
      }
    }

    if (subida) {
      const url = bucket.getPublicUrl(path).data.publicUrl;
      urls.push(url);
      onEstado?.(file, "ok", { url });
    } else {
      fallos.push({ file, nombre: file.name, motivo: ultimoMotivo });
      onEstado?.(file, "error", { motivo: ultimoMotivo });
    }

    if (pausaEntreImagenesMs > 0 && i < files.length - 1) {
      await esperar(pausaEntreImagenesMs);
    }
  }

  return { urls, fallos };
}
