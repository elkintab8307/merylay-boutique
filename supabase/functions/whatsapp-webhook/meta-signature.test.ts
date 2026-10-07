import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verificarFirmaMeta } from "./meta-signature.ts";

describe("verificarFirmaMeta", () => {
  const payload = '{"hola":"mundo"}';
  const secreto = "secreto-de-prueba";
  const firmaValida = "sha256=2f8b3f9d2b1c3a4b5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d";

  it("rechaza si el header de firma es null", () => {
    expect(verificarFirmaMeta(payload, null, secreto)).toBe(false);
  });

  it("rechaza si el secreto no coincide", () => {
    expect(verificarFirmaMeta(payload, firmaValida, "otro-secreto")).toBe(false);
  });

  it("acepta una firma calculada correctamente con el mismo algoritmo", () => {
    const hmac = createHmac("sha256", secreto).update(payload).digest("hex");
    expect(verificarFirmaMeta(payload, `sha256=${hmac}`, secreto)).toBe(true);
  });

  it("rechaza si se altera un solo caracter del payload", () => {
    const hmac = createHmac("sha256", secreto).update(payload).digest("hex");
    expect(verificarFirmaMeta('{"hola":"mundo!"}', `sha256=${hmac}`, secreto)).toBe(false);
  });

  it("rechaza una firma invalida de la misma longitud que la correcta", () => {
    const hmac = createHmac("sha256", secreto).update(payload).digest("hex");
    const alterada = (hmac[0] === "a" ? "b" : "a") + hmac.slice(1);
    expect(alterada.length).toBe(hmac.length);
    expect(verificarFirmaMeta(payload, `sha256=${alterada}`, secreto)).toBe(false);
  });

  it("rechaza (sin lanzar) una firma de distinta longitud", () => {
    const hmac = createHmac("sha256", secreto).update(payload).digest("hex");
    expect(verificarFirmaMeta(payload, `sha256=${hmac.slice(0, 10)}`, secreto)).toBe(false);
    expect(verificarFirmaMeta(payload, `sha256=${hmac}00`, secreto)).toBe(false);
  });

  it("rechaza siempre si el secreto esta vacio, aunque la firma se haya calculado con ese secreto vacio", () => {
    const hmacVacio = createHmac("sha256", "").update(payload).digest("hex");
    expect(verificarFirmaMeta(payload, `sha256=${hmacVacio}`, "")).toBe(false);
  });
});
