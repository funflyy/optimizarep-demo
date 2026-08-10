import { describe, it, expect } from "vitest";
import {
  fileTimestamp,
  stampedFilename,
  scopeLabel,
  stampRows,
  generatedAtLabel,
} from "./report-stamp";

const fecha = new Date(2026, 7, 7, 9, 4); // 7 de agosto de 2026, 09:04

describe("fileTimestamp", () => {
  it("no usa caracteres que Windows rechaza en nombres de archivo", () => {
    const t = fileTimestamp(fecha);
    for (const c of ['/', "\\", ":", "*", "?", '"', "<", ">", "|"]) {
      expect(t).not.toContain(c);
    }
  });

  it("rellena con ceros para que ordene alfabéticamente", () => {
    // Sin el padding, "2026-8-7_94" quedaría después de "2026-12-1_1000"
    expect(fileTimestamp(fecha)).toBe("2026-08-07_0904");
  });

  it("ordena cronológicamente al ordenar como texto", () => {
    const enero = fileTimestamp(new Date(2026, 0, 15, 23, 59));
    const agosto = fileTimestamp(fecha);
    const diciembre = fileTimestamp(new Date(2026, 11, 1, 0, 0));
    expect([diciembre, agosto, enero].sort()).toEqual([
      enero,
      agosto,
      diciembre,
    ]);
  });
});

describe("stampedFilename", () => {
  it("dos descargas del mismo reporte en distinto minuto no colisionan", () => {
    const a = stampedFilename("Costos_REP", fecha);
    const b = stampedFilename("Costos_REP", new Date(2026, 7, 7, 9, 5));
    expect(a).not.toBe(b);
  });

  it("no incluye la extensión: la pone quien exporta", () => {
    expect(stampedFilename("Costos_REP", fecha)).toBe(
      "Costos_REP_2026-08-07_0904"
    );
  });
});

describe("scopeLabel", () => {
  it("omite los filtros vacíos en vez de mostrarlos en blanco", () => {
    const label = scopeLabel({
      report: "Costos",
      scope: { Año: 2025, Mes: null, SIG: "", Marca: undefined },
    });
    expect(label).toBe("Año: 2025");
  });

  it("junta varios filtros en una línea", () => {
    expect(
      scopeLabel({ report: "Costos", scope: { Año: 2025, SIG: "ReSimple" } })
    ).toBe("Año: 2025 · SIG: ReSimple");
  });

  it("acepta un cero como valor válido", () => {
    // 0 es falsy pero es un filtro real: mes 0 = registros anuales
    expect(scopeLabel({ report: "x", scope: { Mes: 0 } })).toBe("Mes: 0");
  });
});

describe("stampRows", () => {
  it("pone el reporte y la fecha primero", () => {
    const rows = stampRows(
      { report: "Declaración SINADER", organization: "MB Empresas" },
      fecha
    );
    expect(rows[0].Campo).toBe("Reporte");
    expect(rows[1].Campo).toBe("Generado");
  });

  it("omite organización y usuario cuando no se conocen", () => {
    const campos = stampRows({ report: "x" }, fecha).map((r) => r.Campo);
    expect(campos).not.toContain("Organización");
    expect(campos).not.toContain("Generado por");
  });

  it("incluye los filtros aplicados, que es lo que distingue un archivo de otro", () => {
    const rows = stampRows(
      { report: "Costos", scope: { Año: 2025, Mes: null } },
      fecha
    );
    expect(rows.find((r) => r.Campo === "Año")?.Valor).toBe("2025");
    expect(rows.find((r) => r.Campo === "Mes")).toBeUndefined();
  });
});

describe("generatedAtLabel", () => {
  it("incluye la hora, no solo la fecha", () => {
    // Dos exports del mismo día tienen que poder distinguirse
    expect(generatedAtLabel(fecha)).toMatch(/\d{1,2}:\d{2}/);
  });
});
