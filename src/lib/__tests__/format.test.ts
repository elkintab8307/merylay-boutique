import { describe, expect, it } from "vitest";
import { formatPrice } from "../format";

describe("formatPrice", () => {
  it("formatea con separador de miles y sin decimales", () => {
    expect(formatPrice(89900)).toContain("89.900");
  });

  it("formatea cero correctamente", () => {
    expect(formatPrice(0)).toContain("0");
  });

  it("no incluye decimales", () => {
    expect(formatPrice(1500)).not.toMatch(/,\d{2}$/);
  });
});
