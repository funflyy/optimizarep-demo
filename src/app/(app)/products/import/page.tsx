"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UploadIcon,
  FileSpreadsheetIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowLeftIcon,
  Loader2Icon,
} from "lucide-react";
import Link from "next/link";
import { parseDecimal } from "@/lib/number";
import { trpc } from "@/lib/trpc";

interface ParsedProduct {
  sku: string;
  name: string;
  brand: string;
  category: string;
  pieces: {
    pieceName: string;
    packagingType: "primary" | "secondary" | "tertiary";
    isDomiciliary: boolean;
    materialClass: string;
    wasteType: "recyclable" | "non_recyclable";
    materialDetail: string;
    weightGrams: number;
    hasGrease: boolean;
    isHazardous: boolean;
  }[];
  unitsSold?: number;
  salesYear?: number;
  errors: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  const createMutation = trpc.product.create.useMutation();

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setParsed([]);
      setImportResult(null);

      // Parse Excel client-side
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      // Map rows to products
      // Expected columns: SKU, Producto, Marca, Categoría, Pieza, TipoEnvase,
      // Domiciliario, Material, DetalleMaterial, Peso(g), TipoResiduo, Grasa,
      // Peligroso, Ventas, AñoVentas
      const productMap = new Map<string, ParsedProduct>();

      for (const row of rows) {
        const sku = String(row["SKU"] || "").trim();
        if (!sku) continue;

        if (!productMap.has(sku)) {
          productMap.set(sku, {
            sku,
            name: String(row["Producto"] || row["Nombre"] || "").trim(),
            brand: String(row["Marca"] || "").trim(),
            category: String(row["Categoría"] || row["Categoria"] || "").trim(),
            pieces: [],
            unitsSold: row["Ventas"] ? Math.round(parseDecimal(row["Ventas"])) : undefined,
            salesYear: row["AñoVentas"] || row["Año"]
              ? Number(row["AñoVentas"] || row["Año"])
              : 2024,
            errors: [],
          });
        }

        const prod = productMap.get(sku)!;
        const pieceName = String(row["Pieza"] || row["Componente"] || "Envase").trim();
        const weight = parseDecimal(row["Peso(g)"] || row["Peso"] || 0);

        if (weight <= 0) {
          prod.errors.push(`Pieza "${pieceName}" sin peso válido`);
        }

        const packagingRaw = String(row["TipoEnvase"] || "Primario").toLowerCase();
        const packagingType = packagingRaw.includes("secund")
          ? "secondary"
          : packagingRaw.includes("terci")
            ? "tertiary"
            : "primary";

        const domRaw = row["Domiciliario"];
        const isDomiciliary =
          domRaw === undefined ||
          domRaw === true ||
          String(domRaw).toLowerCase() === "sí" ||
          String(domRaw).toLowerCase() === "si" ||
          String(domRaw) === "1";

        const wasteRaw = String(row["TipoResiduo"] || "Reciclable").toLowerCase();
        const wasteType = wasteRaw.includes("no") ? "non_recyclable" : "recyclable";

        prod.pieces.push({
          pieceName,
          packagingType,
          isDomiciliary,
          materialClass: String(row["Material"] || "Plástico").trim(),
          wasteType,
          materialDetail: String(row["DetalleMaterial"] || row["Subcategoría"] || "Otros").trim(),
          weightGrams: weight || 1,
          hasGrease: String(row["Grasa"] || "").toLowerCase() === "sí" || row["Grasa"] === true,
          isHazardous:
            String(row["Peligroso"] || "").toLowerCase() === "sí" || row["Peligroso"] === true,
        });
      }

      setParsed(Array.from(productMap.values()));
    },
    []
  );

  async function handleImport() {
    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const prod of parsed) {
      if (prod.errors.length > 0 || prod.pieces.length === 0) {
        failed++;
        continue;
      }
      try {
        await createMutation.mutateAsync({
          sku: prod.sku,
          name: prod.name,
          brand: prod.brand || undefined,
          category: prod.category || undefined,
          pieces: prod.pieces,
          unitsSold: prod.unitsSold,
          salesYear: prod.salesYear,
        });
        success++;
      } catch {
        failed++;
      }
    }

    setImportResult({ success, failed });
    setImporting(false);
  }

  const validCount = parsed.filter(
    (p) => p.errors.length === 0 && p.pieces.length > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/products">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Importar Productos
          </h1>
          <p className="text-muted-foreground mt-1">
            Carga masiva desde archivo Excel (.xlsx / .xls)
          </p>
        </div>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadIcon className="h-5 w-5 text-primary" />
            Cargar Archivo
          </CardTitle>
          <CardDescription>
            Columnas esperadas: SKU, Producto, Marca, Categoría, Pieza,
            TipoEnvase, Material, DetalleMaterial, Peso(g), TipoResiduo, Ventas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 hover:border-primary/50 transition-colors">
                <FileSpreadsheetIcon className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  {file ? (
                    <span className="font-medium text-foreground">
                      {file.name}
                    </span>
                  ) : (
                    "Haz clic para seleccionar archivo"
                  )}
                </div>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  Vista Previa ({parsed.length} productos)
                </CardTitle>
                <CardDescription>
                  {validCount} válidos ·{" "}
                  {parsed.length - validCount} con errores
                </CardDescription>
              </div>
              {!importResult && (
                <Button
                  onClick={handleImport}
                  disabled={importing || validCount === 0}
                >
                  {importing ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UploadIcon className="mr-2 h-4 w-4" />
                  )}
                  Importar {validCount} productos
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {importResult && (
              <div className="mb-4 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  ✅ Importación completada: {importResult.success} exitosos,{" "}
                  {importResult.failed} fallidos
                </p>
                <Button
                  variant="link"
                  className="mt-1 p-0 h-auto"
                  onClick={() => router.push("/products")}
                >
                  Ver productos →
                </Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-center">Piezas</TableHead>
                  <TableHead className="text-right">Peso (g)</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((p) => (
                  <TableRow key={p.sku}>
                    <TableCell>
                      {p.errors.length > 0 ? (
                        <AlertCircleIcon className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {p.sku}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {p.name}
                    </TableCell>
                    <TableCell>{p.brand || "—"}</TableCell>
                    <TableCell className="text-center">
                      {p.pieces.length}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {p.pieces
                        .reduce((a, pc) => a + pc.weightGrams, 0)
                        .toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {p.unitsSold?.toLocaleString("es-CL") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
