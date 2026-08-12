import { z } from "zod";

const optionalUrl = z.union([
  z.literal(""),
  z.string().trim().url("Ingresa una URL válida"),
]);

export const storeSettingsSchema = z.object({
  nombreTienda: z.string().trim().min(2, "Ingresa el nombre de la tienda"),
  contactoEmail: z.string().trim().email("Ingresa un correo válido"),
  contactoTelefono: z.string().trim().min(7, "Ingresa un teléfono válido"),
  envioCostoDefecto: z
    // El `error` del tipo cubre invalid_type, incluido NaN (que es lo que
    // produce `valueAsNumber: true` cuando el campo se deja en blanco).
    .number({ error: "Ingresa un costo de envío válido" })
    .int("El costo de envío debe ser un número entero")
    .min(0, "El costo de envío no puede ser negativo"),
  direccion: z.string().trim(),
  mensajePromocional: z.string().trim(),
  redesInstagram: optionalUrl,
  redesFacebook: optionalUrl,
  redesTiktok: optionalUrl,
  redesWhatsapp: optionalUrl,
  stockBajoUmbral: z
    .number({ error: "Ingresa un umbral válido" })
    .int("El umbral debe ser un número entero")
    .min(0, "El umbral no puede ser negativo"),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

export const STORE_SETTINGS_KEYS: Record<keyof StoreSettingsInput, string> = {
  nombreTienda: "nombre_tienda",
  contactoEmail: "contacto_email",
  contactoTelefono: "contacto_telefono",
  envioCostoDefecto: "envio_costo_defecto",
  direccion: "direccion",
  mensajePromocional: "mensaje_promocional",
  redesInstagram: "redes_instagram",
  redesFacebook: "redes_facebook",
  redesTiktok: "redes_tiktok",
  redesWhatsapp: "redes_whatsapp",
  stockBajoUmbral: "stock_bajo_umbral",
};
