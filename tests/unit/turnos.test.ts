import { describe, expect, it } from "vitest";
import { ESTADOS_TURNO, TRANSICIONES } from "@/lib/turnos";

describe("transiciones de estado de turno", () => {
  it("todas las transiciones llevan a estados existentes y no a sí mismos", () => {
    for (const [desde, hacia] of Object.entries(TRANSICIONES)) {
      for (const h of hacia) {
        expect(h in ESTADOS_TURNO).toBe(true);
        expect(h).not.toBe(desde);
      }
    }
  });

  it("un turno atendido no se puede cancelar directamente", () => {
    expect(TRANSICIONES.atendido).not.toContain("cancelado");
  });
});
