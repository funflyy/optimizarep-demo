import { describe, it, expect } from "vitest";
import { parseProductsSheet, isImportable } from "./parse-products-sheet";
import { normalizeHeader, parseMonth, parseBool, modeOrMax } from "./excel-columns";

/** Fila con las cabeceras reales del archivo del cliente (con espacios) */
function row(over: Record<string, unknown> = {}) {
  return {
    "Año": 2025,
    Mes: "Enero",
    SKU: 50000002,
    Producto: "Yogurt Sabor Durazno 1kg",
    Marca: "SBELT",
    Departamento: "Yogurts",
    "Categoría REP": "DOM",
    "Subcategoría REP": "Plástico",
    Pieza: "Botella",
    "Tipo de Envase": "Primario",
    Material: "PET",
    "Detalle Material": "Sin Grasa",
    Peligroso: "No",
    "Tipo de Residuo": "Reciclable",
    "Peso (g)": 31,
    Ventas: 172066,
    Gestionado: "ReSimple",
    ...over,
  };
}

describe("normalizeHeader", () => {
  it("iguala cabeceras con espacios, acentos y mayúsculas", () => {
    expect(normalizeHeader("Peso (g)")).toBe("pesog");
    expect(normalizeHeader("Peso(g)")).toBe("pesog");
    expect(normalizeHeader("PESO G")).toBe("pesog");
    expect(normalizeHeader("Categoría REP")).toBe("categoriarep");
    expect(normalizeHeader("Subcategoría REP")).toBe("subcategoriarep");
  });
});

describe("parseMonth", () => {
  it("acepta nombre de mes, número y texto numérico", () => {
    expect(parseMonth("Enero")).toBe(1);
    expect(parseMonth("diciembre")).toBe(12);
    expect(parseMonth("Setiembre")).toBe(9);
    expect(parseMonth(3)).toBe(3);
    expect(parseMonth("07")).toBe(7);
  });

  it("devuelve 0 (anual) cuando no reconoce el valor", () => {
    expect(parseMonth("")).toBe(0);
    expect(parseMonth(undefined)).toBe(0);
    expect(parseMonth("Trimestre 1")).toBe(0);
    expect(parseMonth(13)).toBe(0);
  });
});

describe("parseBool", () => {
  it("interpreta Sí/No del Excel", () => {
    expect(parseBool("Sí")).toBe(true);
    expect(parseBool("si")).toBe(true);
    expect(parseBool("No")).toBe(false);
    expect(parseBool(1)).toBe(true);
    expect(parseBool(0)).toBe(false);
    expect(parseBool("")).toBeUndefined();
    expect(parseBool("quizás")).toBeUndefined();
  });
});

describe("modeOrMax", () => {
  it("devuelve el valor más frecuente", () => {
    expect(modeOrMax([172066, 172066, 577153])).toBe(172066);
  });

  it("en empate devuelve el mayor", () => {
    expect(modeOrMax([100, 200])).toBe(200);
  });

  it("undefined si no hay valores", () => {
    expect(modeOrMax([])).toBeUndefined();
  });
});

describe("parseProductsSheet", () => {
  it('lee "Peso (g)" con espacio — el bug de "0 válidos"', () => {
    const [p] = parseProductsSheet([row()]);
    expect(p.pieces).toHaveLength(1);
    expect(p.pieces[0].weightGrams).toBe(31);
    expect(p.errors).toEqual([]);
    expect(isImportable(p)).toBe(true);
  });

  it("clasifica Irreciclable como non_recyclable", () => {
    const [p] = parseProductsSheet([
      row({ "Tipo de Residuo": "Irreciclable" }),
    ]);
    expect(p.pieces[0].wasteType).toBe("non_recyclable");
  });

  it("mantiene Reciclable como recyclable", () => {
    const [p] = parseProductsSheet([row({ "Tipo de Residuo": "Reciclable" })]);
    expect(p.pieces[0].wasteType).toBe("recyclable");
  });

  it("toma la clase de material de Subcategoría REP y el detalle de Material", () => {
    const [p] = parseProductsSheet([row()]);
    expect(p.pieces[0].materialClass).toBe("Plástico");
    expect(p.pieces[0].materialDetail).toBe("PET");
  });

  it('distingue "NO DOM" de "DOM"', () => {
    const [dom] = parseProductsSheet([row({ "Categoría REP": "DOM" })]);
    expect(dom.pieces[0].isDomiciliary).toBe(true);

    const [noDom] = parseProductsSheet([row({ "Categoría REP": "NO DOM" })]);
    expect(noDom.pieces[0].isDomiciliary).toBe(false);
  });

  it('deriva hasGrease de "Detalle Material"', () => {
    const [sin] = parseProductsSheet([row({ "Detalle Material": "Sin Grasa" })]);
    expect(sin.pieces[0].hasGrease).toBe(false);

    const [con] = parseProductsSheet([row({ "Detalle Material": "Con Grasa" })]);
    expect(con.pieces[0].hasGrease).toBe(true);
  });

  it("lee el tipo de envase terciario", () => {
    const [p] = parseProductsSheet([row({ "Tipo de Envase": "Terciario" })]);
    expect(p.pieces[0].packagingType).toBe("tertiary");
  });

  it("agrupa un SKU con varias piezas y no las duplica entre meses", () => {
    const rows = [
      row({ Pieza: "Botella", "Peso (g)": 31 }),
      row({ Pieza: "Tapa", "Peso (g)": 3 }),
      // mismo SKU, otro mes, mismas piezas → no debe duplicar
      row({ Mes: "Febrero", Pieza: "Botella", "Peso (g)": 31 }),
      row({ Mes: "Febrero", Pieza: "Tapa", "Peso (g)": 3 }),
    ];
    const [p] = parseProductsSheet(rows);
    expect(p.pieces).toHaveLength(2);
    expect(p.sales).toHaveLength(2);
    expect(p.sales.map((s) => s.month)).toEqual([1, 2]);
  });

  it("registra una venta por período, no por pieza", () => {
    const rows = [
      row({ Pieza: "Botella", Ventas: 172066 }),
      row({ Pieza: "Tapa", "Peso (g)": 3, Ventas: 172066 }),
    ];
    const [p] = parseProductsSheet(rows);
    expect(p.sales).toEqual([{ year: 2025, month: 1, unitsSold: 172066 }]);
  });

  it("con ventas inconsistentes usa la moda y avisa", () => {
    const rows = [
      row({ Pieza: "Botella", Ventas: 577153 }),
      row({ Pieza: "Tapa", "Peso (g)": 3, Ventas: 172066 }),
      row({ Pieza: "Film", "Peso (g)": 3.86, Ventas: 172066 }),
    ];
    const [p] = parseProductsSheet(rows);
    expect(p.sales[0].unitsSold).toBe(172066);
    expect(p.warnings.some((w) => w.includes("inconsistentes"))).toBe(true);
    // Avisa pero no bloquea
    expect(isImportable(p)).toBe(true);
  });

  it("prefiere las ventas domiciliarias sobre las NO DOM", () => {
    const rows = [
      row({ Pieza: "Botella", "Categoría REP": "DOM", Ventas: 172066 }),
      row({
        Pieza: "Film",
        "Categoría REP": "NO DOM",
        "Tipo de Envase": "Terciario",
        "Peso (g)": 100,
        Ventas: 8000,
      }),
    ];
    const [p] = parseProductsSheet(rows);
    expect(p.sales[0].unitsSold).toBe(172066);
  });

  it("omite la pieza sin peso con un aviso, sin invalidar el producto", () => {
    const rows = [
      row({ Pieza: "Botella", "Peso (g)": 31 }),
      row({ Pieza: "Etiqueta", "Peso (g)": 0 }),
    ];
    const [p] = parseProductsSheet(rows);
    expect(p.pieces).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes("Etiqueta"))).toBe(true);
    expect(isImportable(p)).toBe(true);
  });

  it("invalida el producto si ninguna pieza tiene peso", () => {
    const [p] = parseProductsSheet([row({ "Peso (g)": 0 })]);
    expect(isImportable(p)).toBe(false);
    expect(p.errors).toContain("ninguna pieza con peso válido");
  });

  it("ignora filas sin SKU", () => {
    expect(parseProductsSheet([row({ SKU: "" })])).toHaveLength(0);
  });

  it("acepta pesos con coma decimal chilena", () => {
    const [p] = parseProductsSheet([row({ "Peso (g)": "3,86" })]);
    expect(p.pieces[0].weightGrams).toBeCloseTo(3.86);
  });

  it("cuenta las filas idénticas duplicadas", () => {
    const rows = [row(), row(), row()];
    const [p] = parseProductsSheet(rows);
    expect(p.pieces).toHaveLength(1);
    expect(p.warnings.some((w) => w.includes("duplicada"))).toBe(true);
  });
});
