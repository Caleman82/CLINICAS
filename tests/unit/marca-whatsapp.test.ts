import { describe, expect, it } from "vitest";
import { colorLegible, contrasteConBlanco } from "@/lib/marca";
import { enlaceWhatsApp, numeroWhatsApp } from "@/lib/whatsapp";

describe("color de marca legible", () => {
  it("deja igual un color que ya contrasta", () => {
    expect(colorLegible("#1F6F6B")).toBe("#1F6F6B");
  });
  it("oscurece colores claros hasta contraste AA con blanco", () => {
    for (const c of ["#F5D90A", "#8FD3FE", "#FFFFFF", "#FF7F50"]) {
      expect(contrasteConBlanco(colorLegible(c))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("usa el color por defecto si el valor no es válido", () => {
    expect(colorLegible("rojo")).toBe("#1F6F6B");
  });
});

describe("WhatsApp", () => {
  it("normaliza celulares uruguayos", () => {
    expect(numeroWhatsApp("099 123 456")).toBe("59899123456");
    expect(numeroWhatsApp("+598 99 123 456")).toBe("59899123456");
    expect(numeroWhatsApp("2901 1234")).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });
  it("arma el enlace con el texto codificado", () => {
    expect(enlaceWhatsApp("099123456", "Hola & chau")).toBe("https://wa.me/59899123456?text=Hola%20%26%20chau");
  });
});
