import { createClient } from "@/lib/supabase/client";
import { comprimirImagen } from "./comprimir-imagen";

/**
 * Sube uno o mas archivos directo desde el navegador al bucket
 * "product-images" (RLS ya restringe la escritura a admin/superadmin).
 * A diferencia de subir los archivos crudos en el body de una Server
 * Action, esto evita el limite de payload (~4.5MB) de las funciones
 * serverless de Vercel — el mismo problema que ya se resolvio para las
 * imagenes de los banners del home (ver upload-banner-image-client.ts).
 *
 * Las subidas van UNA POR UNA (no en paralelo): por datos moviles,
 * varias fotos pesadas a la vez saturan la conexion y algunas se caian
 * sin aviso. Cada foto se comprime antes de subir y se reintenta hasta
 * MAX_INTENTOS veces ante fallo de red. Lo que aun asi no sube se
 * devuelve en `fallos` con su nombre y el motivo real, para que el
 * formulario pueda decir exactamente que imagen fallo y en que seccion.
 */

const MAX_INTENTOS = 3;
const ESPERA_REINTENTO_MS = 800;

export type ResultadoSubida = {
  urls: string[];
  fallos: { nombre: string; motivo: string }[];
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function subirImagenesProductoCliente(
  files: File[],
  opciones: { esperaReintentoMs?: number } = {},
): Promise<ResultadoSubida> {
  const esperaReintentoMs = opciones.esperaReintentoMs ?? ESPERA_REINTENTO_MS;
  const urls: string[] = [];
  const fallos: { nombre: string; motivo: string }[] = [];

  const supabase = createClient();
  const bucket = supabase.storage.from("product-images");

  for (const file of files) {
    let comprimida: File;
    try {
      comprimida = await comprimirImagen(file);
    } catch (error) {
      fallos.push({ nombre: file.name, motivo: mensajeDeError(error) });
      continue;
    }

    const extension = comprimida.name.split(".").pop() ?? "jpg";
    const path = `${crypto.randomUUID()}.${extension}`;

    let ultimoMotivo = "No se pudo subir la imagen.";
    let subida = false;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const { error: uploadError } = await bucket.upload(path, comprimida);
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
      urls.push(bucket.getPublicUrl(path).data.publicUrl);
    } else {
      fallos.push({ nombre: file.name, motivo: ultimoMotivo });
    }
  }

  return { urls, fallos };
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "No se pudo procesar la imagen.";
}
