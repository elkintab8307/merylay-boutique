import { describe, expect, it } from "vitest";
import { calcularFirmaIntegridad, verificarFirmaEvento } from "../signature";

describe("calcularFirmaIntegridad", () => {
  it("calcula el hash SHA-256 de referencia + monto + moneda + secreto", () => {
    const resultado = calcularFirmaIntegridad(
      "ML-20260807-abc123",
      5000000,
      "COP",
      "test_integrity_secret",
    );
    expect(resultado).toBe(
      "a28e2bb2ceeceff0d2b04450543da24b2a6130537bd3dab405b254ddad74a039",
    );
  });

  it("produce un hash distinto si cambia el monto", () => {
    const a = calcularFirmaIntegridad("ref-1", 1000, "COP", "secreto");
    const b = calcularFirmaIntegridad("ref-1", 2000, "COP", "secreto");
    expect(a).not.toBe(b);
  });
});

describe("verificarFirmaEvento", () => {
  const eventoValido = {
    data: {
      transaction: {
        id: "1234-1610641025-49201",
        status: "APPROVED",
        amount_in_cents: 4490000,
      },
    },
    signature: {
      properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
      checksum: "5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe",
    },
    timestamp: 1530291411,
  };
  const secret = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";

  it("acepta un evento con firma valida", () => {
    expect(verificarFirmaEvento(eventoValido, secret)).toBe(true);
  });

  it("rechaza un evento con checksum alterado", () => {
    const eventoAlterado = {
      ...eventoValido,
      signature: { ...eventoValido.signature, checksum: "0".repeat(64) },
    };
    expect(verificarFirmaEvento(eventoAlterado, secret)).toBe(false);
  });

  it("rechaza un evento si el secreto no coincide", () => {
    expect(verificarFirmaEvento(eventoValido, "secreto-incorrecto")).toBe(false);
  });

  it("rechaza un evento si un valor de las propiedades fue alterado", () => {
    const eventoAlterado = {
      ...eventoValido,
      data: {
        transaction: { ...eventoValido.data.transaction, status: "DECLINED" },
      },
    };
    expect(verificarFirmaEvento(eventoAlterado, secret)).toBe(false);
  });
});
