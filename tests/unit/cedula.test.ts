import { describe, expect, it } from "vitest";
import { cedulaValida, formatoCedula, normalizarCedula, normalizarCelular } from "@/lib/cedula";

describe("cédula uruguaya", () => {
  it("normaliza y valida el dígito verificador", () => {
    expect(normalizarCedula("1.234.567-2")).toBe("12345672");
    expect(cedulaValida("12345672")).toBe(true);
    expect(cedulaValida("12345673")).toBe(false);
    expect(cedulaValida("4567890")).toBe(true);
    expect(cedulaValida("4567891")).toBe(false);
    expect(cedulaValida("123")).toBe(false);
  });

  it("acepta cédulas de 7 dígitos (6 + verificador)", () => {
    // base 123456 → 0123456: 0*2+1*9+2*8+3*7+4*6+5*3+6*4 = 109 → dígito 1
    expect(cedulaValida("1234561")).toBe(true);
  });

  it("formatea para mostrar", () => {
    expect(formatoCedula("12345672")).toBe("1.234.567-2");
    expect(formatoCedula("1234561")).toBe("123.456-1");
  });

  it("normaliza celulares", () => {
    expect(normalizarCelular("099 123 456")).toBe("099123456");
    expect(normalizarCelular("+598 99-123-456")).toBe("+59899123456");
  });
});
