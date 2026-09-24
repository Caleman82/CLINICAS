import { describe, expect, it } from "vitest";
import {
  aInstante, asignarCarriles, dentroDeHorario, diaSemana, esFecha, fechaLarga, inicioSemana, partesLocales, rangoGrilla, sumarDias,
} from "@/lib/fechas";

describe("zona horaria de Montevideo", () => {
  it("convierte hora local a instante y de vuelta", () => {
    const i = aInstante("2026-10-01", "10:00");
    expect(i.toISOString()).toBe("2026-10-01T13:00:00.000Z");
    expect(partesLocales(i)).toEqual({ fecha: "2026-10-01", hora: "10:00", diaSemana: 4, minutos: 600 });
  });

  it("maneja la medianoche local (que en UTC es otro día)", () => {
    expect(aInstante("2026-10-01", "23:30").toISOString()).toBe("2026-10-02T02:30:00.000Z");
    expect(partesLocales("2026-10-02T02:30:00Z").fecha).toBe("2026-10-01");
  });

  it("funciona con otras zonas con cambio de horario", () => {
    // Madrid: 29/03/2026 cambia a verano (UTC+2).
    expect(aInstante("2026-03-30", "10:00", "Europe/Madrid").toISOString()).toBe("2026-03-30T08:00:00.000Z");
    expect(aInstante("2026-03-27", "10:00", "Europe/Madrid").toISOString()).toBe("2026-03-27T09:00:00.000Z");
  });

  it("rechaza fechas u horas inválidas", () => {
    expect(() => aInstante("2026-02-30", "10:00")).toThrow();
    expect(() => aInstante("2026-02-10", "24:00")).toThrow();
    expect(esFecha("2026-02-28")).toBe(true);
    expect(esFecha("2026-13-01")).toBe(false);
  });
});

describe("calendario", () => {
  it("días de la semana ISO y semanas que empiezan el lunes", () => {
    expect(diaSemana("2026-09-28")).toBe(1);
    expect(diaSemana("2026-10-04")).toBe(7);
    expect(inicioSemana("2026-10-04")).toBe("2026-09-28");
    expect(inicioSemana("2026-09-28")).toBe("2026-09-28");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(fechaLarga("2026-10-01")).toBe("jueves 1 de octubre de 2026");
  });
});

describe("grilla de agenda", () => {
  it("el rango cubre horarios y turnos, redondeado a horas", () => {
    expect(rangoGrilla([])).toEqual({ inicio: 480, fin: 1200 });
    expect(rangoGrilla([{ inicio: 9 * 60 + 30, fin: 13 * 60 }, { inicio: 14 * 60, fin: 18 * 60 + 15 }])).toEqual({ inicio: 540, fin: 1140 });
  });

  it("detecta turnos fuera del horario de atención", () => {
    const franjas = [{ inicio: 540, fin: 780 }, { inicio: 840, fin: 1080 }];
    expect(dentroDeHorario(540, 570, franjas)).toBe(true);
    expect(dentroDeHorario(760, 800, franjas)).toBe(false);
    expect(dentroDeHorario(800, 830, franjas)).toBe(false);
  });

  it("asigna carriles a turnos superpuestos", () => {
    const r = asignarCarriles([
      { id: "a", inicio: 600, fin: 660 },
      { id: "b", inicio: 630, fin: 690 },
      { id: "c", inicio: 700, fin: 730 },
    ]);
    const por = Object.fromEntries(r.map((x) => [x.id, [x.carril, x.carriles]]));
    expect(por).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});
