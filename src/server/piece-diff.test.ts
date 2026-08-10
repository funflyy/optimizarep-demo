import { describe, it, expect } from "vitest";
import { diffPieces, type AuditablePiece } from "./piece-diff";

function pieza(over: Partial<AuditablePiece> = {}): AuditablePiece {
  return {
    pieceName: "Pote",
    isDomiciliary: true,
    materialClass: "Plástico",
    materialDetail: "PS",
    weightGrams: 7.7,
    packagingType: "primary",
    wasteType: "recyclable",
    hasGrease: false,
    isHazardous: false,
    notSubjectToRep: false,
    recycledPercentage: null,
    ...over,
  };
}

describe("diffPieces", () => {
  it("guardar sin cambios no registra nada", () => {
    // Si registrara ruido, la auditoría se volvería inservible: cada guardado
    // dejaría una entrada aunque el usuario no haya tocado nada
    expect(diffPieces([pieza()], [pieza()])).toEqual({});
  });

  it("detecta el cambio de gramaje, que es el de mayor impacto en el costo", () => {
    const d = diffPieces([pieza()], [pieza({ weightGrams: 6.2 })]);
    expect(d.modificadas).toEqual([
      {
        pieza: "Pote",
        segmento: "DOM",
        weightGrams: { antes: 7.7, ahora: 6.2 },
      },
    ]);
  });

  it("un cambio de material es una modificación, no una pieza nueva y otra borrada", () => {
    const d = diffPieces([pieza()], [pieza({ materialDetail: "PP Rígido" })]);
    expect(d.agregadas).toBeUndefined();
    expect(d.eliminadas).toBeUndefined();
    expect(d.modificadas).toHaveLength(1);
  });

  it("registra piezas agregadas y eliminadas con su material y peso", () => {
    const d = diffPieces(
      [pieza(), pieza({ pieceName: "Tapa", weightGrams: 0.5 })],
      [pieza(), pieza({ pieceName: "Etiqueta", weightGrams: 0.2 })]
    );
    expect(d.agregadas).toEqual(["Etiqueta (PS, 0.2 g)"]);
    expect(d.eliminadas).toEqual(["Tapa (PS, 0.5 g)"]);
  });

  it("distingue la misma pieza en distinto segmento", () => {
    const dom = pieza({ isDomiciliary: true });
    const noDom = pieza({ isDomiciliary: false });
    const d = diffPieces([dom], [dom, noDom]);
    expect(d.agregadas).toHaveLength(1);
    expect(d.modificadas).toBeUndefined();
  });

  it("no confunde el float del peso con un cambio real", () => {
    // 7,7 puede volver de la base como 7,699999...
    const d = diffPieces([pieza({ weightGrams: 7.7 })], [pieza({ weightGrams: 7.70000001 })]);
    expect(d).toEqual({});
  });

  it("no confunde el % de reciclado en texto con un cambio real", () => {
    // La base devuelve decimal como string; el formulario manda número
    const d = diffPieces(
      [pieza({ recycledPercentage: "25.00" })],
      [pieza({ recycledPercentage: 25 })]
    );
    expect(d).toEqual({});
  });

  it("ignora diferencias de mayúsculas y espacios en el nombre de la pieza", () => {
    const d = diffPieces([pieza({ pieceName: "Pote" })], [pieza({ pieceName: " pote " })]);
    expect(d).toEqual({});
  });

  it("acota el detalle en cambios masivos en vez de volcar la tabla entera", () => {
    const antes = Array.from({ length: 50 }, (_, i) =>
      pieza({ pieceName: `Pieza ${i}` })
    );
    const d = diffPieces(antes, []);
    expect(d.eliminadas).toMatchObject({ total: 50 });
    expect((d.eliminadas as { muestra: string[] }).muestra).toHaveLength(20);
  });

  it("maneja dos piezas con el mismo nombre y segmento", () => {
    // Pasa de verdad: dos etiquetas distintas sobre el mismo envase
    const a = pieza({ pieceName: "Etiqueta", weightGrams: 0.2 });
    const b = pieza({ pieceName: "Etiqueta", weightGrams: 0.4 });
    const d = diffPieces([a, b], [a, pieza({ pieceName: "Etiqueta", weightGrams: 0.5 })]);
    expect(d.modificadas).toEqual([
      {
        pieza: "Etiqueta",
        segmento: "DOM",
        weightGrams: { antes: 0.4, ahora: 0.5 },
      },
    ]);
  });
});
