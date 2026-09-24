import { describe, expect, it } from "vitest";
import { formatoFechaHora } from "@/lib/formato";

describe("formato de fecha y hora", () => {
  it("usa hora de Montevideo y reloj de 24 horas", () => {
    expect(formatoFechaHora("2026-09-27T08:26:00Z")).toBe("27/09/2026, 05:26");
    expect(formatoFechaHora("2026-09-27T20:05:00Z")).toBe("27/09/2026, 17:05");
  });
});
