/**
 * Diagnóstico de un Excel de Línea Base de Productos antes de importarlo.
 *
 * Corre el MISMO parser que usa la pantalla de importación, así que sirve para
 * saber por qué un archivo del cliente sale con errores sin tener que probar
 * en la UI.
 *
 * Uso:
 *   pnpm tsx scripts/check-linea-base.ts "<ruta al .xlsx>" [nombre-de-hoja]
 */
import fs from "node:fs";
import * as XLSX from "xlsx";
import {
  parseProductsSheet,
  isImportable,
} from "../src/lib/parse-products-sheet";

const [path, sheetArg] = process.argv.slice(2);
if (!path) {
  console.error('Uso: pnpm tsx scripts/check-linea-base.ts "<ruta al .xlsx>" [hoja]');
  process.exit(1);
}
if (!fs.existsSync(path)) {
  console.error(`Archivo no encontrado: ${path}`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
const sheetName = sheetArg ?? wb.SheetNames[0];
if (!wb.Sheets[sheetName]) {
  console.error(`Hoja "${sheetName}" no existe. Hojas: ${wb.SheetNames.join(", ")}`);
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);
console.log(`Archivo : ${path}`);
console.log(`Hoja    : ${sheetName}`);
console.log(`Cabeceras detectadas:\n  ${Object.keys(rows[0] ?? {}).join("\n  ")}\n`);

const parsed = parseProductsSheet(rows);
const ok = parsed.filter(isImportable);

console.log(`Filas leídas       : ${rows.length}`);
console.log(`Productos (SKUs)   : ${parsed.length}`);
console.log(`VÁLIDOS            : ${ok.length}`);
console.log(`Con errores        : ${parsed.length - ok.length}`);
console.log(`Con avisos         : ${parsed.filter((p) => p.warnings.length).length}`);
console.log(`Piezas totales     : ${parsed.reduce((a, p) => a + p.pieces.length, 0)}`);
console.log(`Registros de venta : ${parsed.reduce((a, p) => a + p.sales.length, 0)}`);

const pieces = parsed.flatMap((p) => p.pieces);
if (pieces.length > 0) {
  console.log("\n=== Valores mapeados (para revisar que el mapeo sea correcto) ===");
  const show = (label: string, values: unknown[]) =>
    console.log(`  ${label.padEnd(16)}: ${JSON.stringify([...new Set(values)])}`);
  show("packagingType", pieces.map((p) => p.packagingType));
  show("wasteType", pieces.map((p) => p.wasteType));
  show("isDomiciliary", pieces.map((p) => p.isDomiciliary));
  show("hasGrease", pieces.map((p) => p.hasGrease));
  show("isHazardous", pieces.map((p) => p.isHazardous));
  show("materialClass", pieces.map((p) => p.materialClass));
  show("materialDetail", pieces.map((p) => p.materialDetail));
}

const conError = parsed.filter((p) => !isImportable(p));
if (conError.length > 0) {
  console.log("\n=== ERRORES (no se importan) ===");
  for (const p of conError) console.log(`  ${p.sku}: ${p.errors.join(" | ")}`);
}

const conAviso = parsed.filter((p) => p.warnings.length > 0);
if (conAviso.length > 0) {
  console.log("\n=== AVISOS (se importan, revisar) ===");
  for (const p of conAviso) console.log(`  ${p.sku}: ${p.warnings.join(" | ")}`);
}
