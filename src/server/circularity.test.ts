import { describe, it, expect } from "vitest";
import {
  scoreCircularity,
  levelOf,
  DIMENSION_WEIGHTS,
  type CircularityPiece,
} from "./circularity";

function pieza(over: Partial<CircularityPiece> = {}): CircularityPiece {
  return {
    pieceName: "Botella",
    materialDetail: "PET",
    weightGrams: 30,
    packagingType: "primary",
    wasteType: "recyclable",
    hasGrease: false,
    recycledPercentage: null,
    ...over,
  };
}

const dim = (r: ReturnType<typeof scoreCircularity>, key: string) =>
  r.dimensions.find((d) => d.key === key)!;

describe("pesos y escala definidos por MB", () => {
  it("los pesos suman 100%", () => {
    const suma = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it("los cortes de nivel son los del documento", () => {
    expect(levelOf(100)).toBe("Excelente");
    expect(levelOf(80)).toBe("Excelente");
    expect(levelOf(79.9)).toBe("Bueno");
    expect(levelOf(60)).toBe("Bueno");
    expect(levelOf(59.9)).toBe("Mejorable");
    expect(levelOf(40)).toBe("Mejorable");
    expect(levelOf(39.9)).toBe("Crítico");
    expect(levelOf(0)).toBe("Crítico");
  });
});

describe("falta de dato no es cero", () => {
  it("sin material reciclado declarado, esa dimensión no puntúa 0: no entra", () => {
    const r = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: 30,
    });
    const reciclado = dim(r, "reciclado");
    expect(reciclado.score).toBeNull();
    expect(reciclado.effectiveWeight).toBe(0);
    // Su 15% se reparte entre las otras cuatro
    const suma = r.dimensions.reduce((a, d) => a + d.effectiveWeight, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it("declarar 0% SÍ puntúa 0: no es lo mismo que no declarar", () => {
    const sinDeclarar = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: 30,
    });
    const conCero = scoreCircularity({
      pieces: [pieza({ recycledPercentage: 0 })],
      weightBenchmarkGrams: 30,
    });
    expect(dim(sinDeclarar, "reciclado").score).toBeNull();
    expect(dim(conCero, "reciclado").score).toBe(0);
    expect(conCero.score).toBeLessThan(sinDeclarar.score);
  });

  it("sin cohorte comparable, la dimensión peso queda fuera", () => {
    const r = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: null,
    });
    expect(dim(r, "peso").score).toBeNull();
    expect(dim(r, "peso").detail).toContain("sin envases comparables");
  });
});

describe("número de materiales y componentes", () => {
  it("un envase monomaterial de una pieza saca el máximo en ambas", () => {
    const r = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: 30,
    });
    expect(dim(r, "materiales").score).toBe(100);
    expect(dim(r, "componentes").score).toBe(100);
    expect(dim(r, "materiales").detail).toBe("monomaterial");
  });

  it("cuenta materiales distintos, no piezas", () => {
    // Tres piezas del mismo material: penaliza componentes, no materiales
    const r = scoreCircularity({
      pieces: [pieza(), pieza({ pieceName: "Tapa" }), pieza({ pieceName: "Asa" })],
      weightBenchmarkGrams: 90,
    });
    expect(dim(r, "materiales").score).toBe(100);
    expect(dim(r, "componentes").score).toBe(60);
  });

  it("no baja de cero con envases muy compuestos", () => {
    const muchas = Array.from({ length: 12 }, (_, i) =>
      pieza({ pieceName: `P${i}`, materialDetail: `M${i}` })
    );
    const r = scoreCircularity({ pieces: muchas, weightBenchmarkGrams: 360 });
    expect(dim(r, "materiales").score).toBe(0);
    expect(dim(r, "componentes").score).toBe(0);
  });
});

describe("reciclabilidad ponderada por masa", () => {
  it("una etiqueta no reciclable de 0,2 g no hunde una botella de 30 g", () => {
    const r = scoreCircularity({
      pieces: [
        pieza({ weightGrams: 30 }),
        pieza({
          pieceName: "Etiqueta",
          materialDetail: "PVC",
          weightGrams: 0.2,
          wasteType: "non_recyclable",
        }),
      ],
      weightBenchmarkGrams: 30,
    });
    // Por conteo serían 50 puntos; por masa es lo que corresponde
    expect(dim(r, "reciclabilidad").score).toBeGreaterThan(99);
  });

  it("una pieza reciclable con grasa cuenta la mitad", () => {
    const limpia = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: 30,
    });
    const grasosa = scoreCircularity({
      pieces: [pieza({ hasGrease: true })],
      weightBenchmarkGrams: 30,
    });
    expect(dim(limpia, "reciclabilidad").score).toBe(100);
    expect(dim(grasosa, "reciclabilidad").score).toBe(50);
    expect(dim(grasosa, "reciclabilidad").detail).toContain("con grasa");
  });
});

describe("material reciclado", () => {
  it("el puntaje es el % incorporado, ponderado por masa", () => {
    const r = scoreCircularity({
      pieces: [
        pieza({ weightGrams: 90, recycledPercentage: 40 }),
        pieza({ pieceName: "Tapa", weightGrams: 10, recycledPercentage: 0 }),
      ],
      weightBenchmarkGrams: 100,
    });
    // (40×90 + 0×10) / 100 = 36
    expect(dim(r, "reciclado").score).toBeCloseTo(36, 5);
  });

  it("pondera solo sobre la masa declarada, no sobre el envase completo", () => {
    // Una pieza declarada al 50% y otra sin declarar: el promedio es 50, no 25
    const r = scoreCircularity({
      pieces: [
        pieza({ weightGrams: 50, recycledPercentage: 50 }),
        pieza({ pieceName: "Tapa", weightGrams: 50, recycledPercentage: null }),
      ],
      weightBenchmarkGrams: 100,
    });
    expect(dim(r, "reciclado").score).toBeCloseTo(50, 5);
  });
});

describe("peso contra envases comparables", () => {
  it("pesar como la mediana vale 50 puntos", () => {
    const r = scoreCircularity({
      pieces: [pieza({ weightGrams: 30 })],
      weightBenchmarkGrams: 30,
    });
    expect(dim(r, "peso").score).toBe(50);
  });

  it("la mitad de la mediana vale 75 y el doble vale 0", () => {
    const liviano = scoreCircularity({
      pieces: [pieza({ weightGrams: 15 })],
      weightBenchmarkGrams: 30,
    });
    const pesado = scoreCircularity({
      pieces: [pieza({ weightGrams: 60 })],
      weightBenchmarkGrams: 30,
    });
    expect(dim(liviano, "peso").score).toBe(75);
    expect(dim(pesado, "peso").score).toBe(0);
  });

  it("informa la desviación contra la mediana", () => {
    const r = scoreCircularity({
      pieces: [pieza({ weightGrams: 45 })],
      weightBenchmarkGrams: 30,
    });
    expect(dim(r, "peso").detail).toContain("+50%");
  });
});

describe("alcance: el embalaje de transporte queda fuera", () => {
  it("un pallet no cuenta como componente ni como material del envase", () => {
    const conPallet = scoreCircularity({
      pieces: [
        pieza(),
        pieza({
          pieceName: "Pallet",
          materialDetail: "Madera",
          weightGrams: 100,
          packagingType: "tertiary",
        }),
      ],
      weightBenchmarkGrams: 30,
    });
    const sinPallet = scoreCircularity({
      pieces: [pieza()],
      weightBenchmarkGrams: 30,
    });
    // Declarar el pallet no puede empeorar el índice: sería castigar al que
    // declara mejor, y en la línea base solo la mitad de los SKU lo declara
    expect(conPallet.score).toBe(sinPallet.score);
    expect(conPallet.excludedTertiary).toBe(1);
    expect(conPallet.totalWeightGrams).toBe(30);
  });

  it("el peso evaluado es el del envase, no el del envase más el pallet", () => {
    const r = scoreCircularity({
      pieces: [
        pieza({ weightGrams: 30 }),
        pieza({ pieceName: "Pallet", weightGrams: 100, packagingType: "tertiary" }),
      ],
      weightBenchmarkGrams: 30,
    });
    expect(dim(r, "peso").score).toBe(50);
  });

  it("el envase secundario sí cuenta: acompaña al producto", () => {
    const r = scoreCircularity({
      pieces: [
        pieza(),
        pieza({ pieceName: "Estuche", materialDetail: "Cartón", packagingType: "secondary" }),
      ],
      weightBenchmarkGrams: 60,
    });
    expect(dim(r, "componentes").score).toBe(80);
    expect(dim(r, "materiales").score).toBe(75);
  });
});

describe("índice completo", () => {
  it("un envase ideal se acerca a 100", () => {
    const r = scoreCircularity({
      pieces: [pieza({ weightGrams: 10, recycledPercentage: 100 })],
      weightBenchmarkGrams: 30,
    });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.level).toBe("Excelente");
  });

  it("un envase malo cae a crítico", () => {
    const r = scoreCircularity({
      pieces: [
        pieza({ materialDetail: "PVC", weightGrams: 40, wasteType: "non_recyclable" }),
        pieza({ pieceName: "Film", materialDetail: "PS", weightGrams: 20, wasteType: "non_recyclable" }),
        pieza({ pieceName: "Tapa", materialDetail: "PP", weightGrams: 10, wasteType: "non_recyclable" }),
        pieza({ pieceName: "Bandeja", materialDetail: "EPS", weightGrams: 20, wasteType: "non_recyclable" }),
        pieza({ pieceName: "Etiqueta", materialDetail: "Papel/PET", weightGrams: 10, wasteType: "non_recyclable" }),
      ],
      weightBenchmarkGrams: 30,
    });
    expect(r.level).toBe("Crítico");
  });

  it("señala la dimensión más débil, que es por dónde empezar", () => {
    const r = scoreCircularity({
      pieces: [pieza({ weightGrams: 90, wasteType: "non_recyclable" })],
      weightBenchmarkGrams: 90,
    });
    expect(r.weakest?.key).toBe("reciclabilidad");
  });

  it("un SKU sin piezas no revienta ni inventa un puntaje", () => {
    const r = scoreCircularity({ pieces: [], weightBenchmarkGrams: null });
    expect(r.score).toBe(0);
    expect(r.weakest).toBeNull();
  });
});
