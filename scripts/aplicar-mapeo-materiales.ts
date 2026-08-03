/**
 * Aplica el mapeo material → categoría de tarifa para todos los SIG.
 *
 * Sin filas en `tariff_mappings` la tarifa de cada pieza es 0 y el Resumen
 * Ejecutivo muestra UF 0. La matriz de la UI pre-selecciona en verde, pero eso
 * es solo visual: no escribe en la base hasta que alguien toca cada Select.
 * Este script guarda el mapeo de golpe.
 *
 * LA GRASA IMPORTA. `getCostRows` exige coincidencia exacta de `has_grease`
 * entre el mapeo y la pieza, y ReSimple cobra distinto: PP sin grasa 2,95
 * UF/ton vs PP con grasa 5,09. La matriz de la UI no distingue grasa, así que
 * todo lo guardado desde ahí queda en has_grease=false y las piezas con grasa
 * se quedan sin tarifa. Aquí se genera una fila por cada combinación real de
 * (detalle, segmento, grasa) que existe en el catálogo.
 *
 * DECISIONES QUE NO SON OBVIAS — se marcan en la salida para que MB valide:
 *   - PEAD: el Excel dice solo "PEAD". ReSimple distingue flexible (2,95) de
 *     rígido (4,18). Se asume RÍGIDO por ser el caso más común en envases y
 *     el más caro (no subestima el costo).
 *   - PET: "Botellas PET" (2,99) vs "Otros envases PET" (4,06). Se asume
 *     BOTELLA porque las piezas se llaman "Botella" en el archivo.
 *   - Madera: ReSimple no tiene categoría de madera. Queda SIN MAPEAR en vez
 *     de forzarla a "Otros" de plásticos.
 *
 * Idempotente: upsert por (org, sistema, detalle, segmento, grasa, peligroso).
 *
 * Uso:
 *   pnpm tsx scripts/aplicar-mapeo-materiales.ts --dry    (solo mostrar)
 *   pnpm tsx scripts/aplicar-mapeo-materiales.ts
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
// `sqlTag` es el tag de Drizzle; el cliente de postgres también se llama sql
import { count, eq, sql as sqlTag } from "drizzle-orm";
import * as schema from "../src/server/db/schema";

loadEnvConfig(process.cwd());

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (revisar .env.local)");
  process.exit(1);
}

/**
 * materialDetail del catálogo → subcategoría del SIG.
 * `conGrasa` se usa cuando la pieza trae grasa y el SIG tiene variante.
 */
const HOMOLOGACION: Record<
  string,
  { sinGrasa: string; conGrasa?: string; nota?: string }
> = {
  "Tetra Pak": { sinGrasa: "Cartón para Bebidas" },
  "Lámina de aluminio": { sinGrasa: "Aluminio (latas)" },
  "Otros Metales": { sinGrasa: "Otros envases de metal" },
  Cartón: { sinGrasa: "Cartón" },
  "Cartón plastificado": { sinGrasa: "Otro Papel Compuesto" },
  "Papel/PET": { sinGrasa: "Otro Papel Compuesto" },
  "Otros Plásticos": { sinGrasa: "Otros" },
  PEAD: {
    sinGrasa: "PEAD rígido",
    conGrasa: "PEAD con grasa",
    nota: "asumido RÍGIDO (flexible sería 2,95 en vez de 4,18)",
  },
  PEBD: { sinGrasa: "PEBD sin grasa", conGrasa: "PEBD con grasa" },
  PET: {
    sinGrasa: "Botellas PET",
    nota: "asumido BOTELLA (otros envases PET serían 4,06 en vez de 2,99)",
  },
  "PP Rígido": { sinGrasa: "PP sin grasa", conGrasa: "PP con grasa" },
  "PP flexible": { sinGrasa: "PP sin grasa", conGrasa: "PP con grasa" },
  PS: { sinGrasa: "PS sin grasa", conGrasa: "PS con grasa y EPS" },
  PVC: { sinGrasa: "PVC", conGrasa: "PVC" },
  // Madera: sin categoría equivalente en los SIG de envases. Se deja fuera.
};

/** El material del SIG debe ser flexible o rígido según el detalle */
function preferenciaMaterial(detalle: string): string | undefined {
  if (/flexible/i.test(detalle)) return "Plásticos Flexibles";
  if (/r[íi]gido/i.test(detalle)) return "Plásticos Rígidos";
  if (detalle === "PEAD") return "Plásticos Rígidos"; // ver nota
  if (detalle === "PEBD") return "Plásticos Flexibles";
  return undefined;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql, { schema });

  // Combinaciones reales del catálogo, por organización
  const segmentExpr =
    sqlTag<string>`CASE WHEN ${schema.productPieces.isDomiciliary} THEN 'Domiciliario' ELSE 'No Domiciliario' END`;

  const combos = await db
    .select({
      organizationId: schema.products.organizationId,
      materialDetail: schema.productPieces.materialDetail,
      segment: segmentExpr,
      hasGrease: schema.productPieces.hasGrease,
      isHazardous: schema.productPieces.isHazardous,
      piezas: count(),
    })
    .from(schema.productPieces)
    .innerJoin(
      schema.products,
      eq(schema.products.id, schema.productPieces.productId)
    )
    .groupBy(
      schema.products.organizationId,
      schema.productPieces.materialDetail,
      segmentExpr,
      schema.productPieces.hasGrease,
      schema.productPieces.isHazardous
    );

  const systems = await db.select().from(schema.managementSystems);
  const cats = await db.select().from(schema.tariffCategories);

  let guardados = 0;
  const sinCategoria: string[] = [];
  const notas = new Set<string>();

  for (const c of combos) {
    const homo = HOMOLOGACION[c.materialDetail];
    if (!homo) {
      sinCategoria.push(
        `${c.materialDetail} (${c.segment}) — sin homologación definida, ${c.piezas} piezas`
      );
      continue;
    }
    if (homo.nota) notas.add(`${c.materialDetail}: ${homo.nota}`);

    const objetivo = c.hasGrease ? (homo.conGrasa ?? homo.sinGrasa) : homo.sinGrasa;
    const prefMaterial = preferenciaMaterial(c.materialDetail);

    for (const sys of systems) {
      // Candidatas: mismo SIG, mismo segmento, subcategoría objetivo, y que no
      // sea la variante "Peligroso" salvo que la pieza lo sea.
      let cand = cats.filter(
        (tc) =>
          tc.systemId === sys.id &&
          tc.segment === c.segment &&
          tc.subcategory.toLowerCase() === objetivo.toLowerCase() &&
          (c.isHazardous
            ? tc.tariffType === "Peligroso"
            : tc.tariffType !== "Peligroso")
      );

      // Desambiguar flexible vs rígido cuando aplica
      if (cand.length > 1 && prefMaterial) {
        const filtrada = cand.filter((tc) => tc.material === prefMaterial);
        if (filtrada.length > 0) cand = filtrada;
      }

      if (cand.length === 0) continue; // ese SIG no cubre esta combinación

      const elegida = cand[0];

      if (dry) {
        guardados++;
        continue;
      }

      await db
        .insert(schema.tariffMappings)
        .values({
          organizationId: c.organizationId,
          systemId: sys.id,
          materialDetail: c.materialDetail,
          segment: c.segment,
          hasGrease: c.hasGrease,
          isHazardous: c.isHazardous,
          tariffCategoryId: elegida.id,
          isManual: false,
        })
        .onConflictDoUpdate({
          target: [
            schema.tariffMappings.organizationId,
            schema.tariffMappings.systemId,
            schema.tariffMappings.materialDetail,
            schema.tariffMappings.segment,
            schema.tariffMappings.hasGrease,
            schema.tariffMappings.isHazardous,
          ],
          set: { tariffCategoryId: elegida.id, updatedAt: new Date() },
        });
      guardados++;
    }
  }

  console.log(`${dry ? "[dry] " : ""}${guardados} mapeos`);

  if (notas.size > 0) {
    console.log("\n⚠ DECISIONES A VALIDAR CON MB:");
    for (const n of notas) console.log(`   ${n}`);
  }
  if (sinCategoria.length > 0) {
    console.log("\n⚠ SIN MAPEAR (no hay categoría equivalente):");
    for (const s of sinCategoria) console.log(`   ${s}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
