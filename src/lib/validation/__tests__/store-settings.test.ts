import { describe, expect, it } from "vitest";
import { storeSettingsSchema } from "../store-settings";

const base = {
  nombreTienda: "MeryLay Boutique",
  contactoEmail: "contacto@merylayboutique.com",
  contactoTelefono: "3001234567",
  envioCostoDefecto: 15000,
  direccion: "Calle 10 #20-30, Bogotá",
  mensajePromocional: "",
  redesInstagram: "",
  redesFacebook: "",
  redesTiktok: "",
  redesWhatsapp: "",
  stockBajoUmbral: 5,
};

describe("storeSettingsSchema", () => {
  it("acepta datos validos con redes vacias", () => {
    expect(storeSettingsSchema.safeParse(base).success).toBe(true);
  });

  it("acepta URLs de redes cuando se completan", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      redesInstagram: "https://instagram.com/merylay",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un correo de contacto invalido", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      contactoEmail: "no-es-un-correo",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un costo de envio negativo", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      envioCostoDefecto: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un umbral de stock bajo negativo", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      stockBajoUmbral: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un umbral de stock bajo con decimales", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      stockBajoUmbral: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una URL de red social mal formada", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      redesInstagram: "no-es-una-url",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un nombre de tienda demasiado corto", () => {
    const result = storeSettingsSchema.safeParse({ ...base, nombreTienda: "M" });
    expect(result.success).toBe(false);
  });

  it("rechaza un costo de envio NaN con mensaje en español", () => {
    const result = storeSettingsSchema.safeParse({
      ...base,
      envioCostoDefecto: NaN,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Ingresa un costo de envío válido",
      );
    }
  });
});
