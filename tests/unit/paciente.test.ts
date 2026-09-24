import { describe, expect, it } from "vitest";
import { emailTecnicoPaciente, esEmailTecnicoPaciente } from "@/lib/paciente";

describe("identidad técnica del paciente", () => {
  it("es distinta por clínica para la misma cédula", () => {
    expect(emailTecnicoPaciente("cemer", "12345672")).toBe("p-12345672@cemer.pacientes.invalid");
    expect(emailTecnicoPaciente("cemer", "12345672")).not.toBe(emailTecnicoPaciente("dental-sur", "12345672"));
    expect(esEmailTecnicoPaciente("p-12345672@cemer.pacientes.invalid")).toBe(true);
    expect(esEmailTecnicoPaciente("ana@cemer.com.uy")).toBe(false);
  });
});
