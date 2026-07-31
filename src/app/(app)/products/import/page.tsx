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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertTriangleIcon,
  ArrowLeftIcon,
  Loader2Icon,
} from "lucide-react";
import Link from "next/link";
import {
  isImportable,
  parseProductsSheet,
  type ParsedProduct,
} from "@/lib/parse-products-sheet";
import { trpc } from "@/lib/trpc";

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    failures: string[];
  } | null>(null);

  const createMutation = trpc.product.create.useMutation();
  const { data: me } = trpc.auth.me.useQuery();
  const { data: orgs } = trpc.auth.writableOrgs.useQuery();

  // La organización destino: la elegida, o la propia del usuario. Un
  // superadmin sin organización asignada debe elegir una explícitamente.
  const targetOrgId = orgId || me?.orgId || "";
  const mustChooseOrg = !!orgs && orgs.length > 1;
  const noOrgAvailable = !!orgs && orgs.length === 0;

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setParsed([]);
      setParseError(null);
      setImportResult(null);

      try {
        const XLSX = await import("xlsx");
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        if (rows.length === 0) {
          setParseError("La primera hoja del archivo no tiene filas de datos.");
          return;
        }

        setParsed(parseProductsSheet(rows));
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "No se pudo leer el archivo."
        );
      }
    },
    []
  );

  async function handleImport() {
    setImporting(true);
    let success = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const prod of parsed) {
      if (!isImportable(prod)) {
        failed++;
        continue;
      }
      try {
        await createMutation.mutateAsync({
          organizationId: targetOrgId || undefined,
          sku: prod.sku,
          name: prod.name,
          brand: prod.brand || undefined,
          category: prod.category || undefined,
          pieces: prod.pieces,
          sales: prod.sales,
        });
        success++;
      } catch (err) {
        failed++;
        // Antes el error se descartaba en silencio: la importación reportaba
        // "fallidos" sin ninguna pista de la causa.
        failures.push(
          `${prod.sku}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    setImportResult({ success, failed, failures });
    setImporting(false);
  }

  const validCount = parsed.filter(isImportable).length;
  const warningCount = parsed.filter((p) => p.warnings.length > 0).length;
  const issues = parsed.filter(
    (p) => p.errors.length > 0 || p.warnings.length > 0
  );

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
            Columnas reconocidas: SKU, Producto, Marca, Departamento, Categoría
            REP (DOM / NO DOM), Subcategoría REP, Pieza, Tipo de Envase,
            Material, Detalle Material, Peso (g), Tipo de Residuo, Peligroso,
            Año, Mes, Ventas. Los espacios, acentos y mayúsculas de las
            cabeceras no importan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Organización destino — solo si el usuario puede elegir */}
          {mustChooseOrg && (
            <div className="space-y-2">
              <Label htmlFor="org">Organización destino</Label>
              <Select value={targetOrgId} onValueChange={setOrgId}>
                <SelectTrigger id="org" className="w-full sm:w-96">
                  <SelectValue placeholder="Elegir organización…" />
                </SelectTrigger>
                <SelectContent>
                  {orgs?.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Los productos se cargarán en esta organización.
              </p>
            </div>
          )}

          {noOrgAvailable && (
            <p className="text-sm text-destructive">
              No tienes ninguna organización asignada. Contacta al
              administrador antes de importar.
            </p>
          )}

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

          {parseError && (
            <p className="mt-4 text-sm text-destructive">{parseError}</p>
          )}
        </CardContent>
      </Card>

      {/* Preview */}
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Vista Previa ({parsed.length} productos)</CardTitle>
                <CardDescription>
                  {validCount} válidos · {parsed.length - validCount} con errores
                  {warningCount > 0 && ` · ${warningCount} con avisos`}
                </CardDescription>
              </div>
              {!importResult && (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    onClick={handleImport}
                    disabled={importing || validCount === 0 || !targetOrgId}
                  >
                    {importing ? (
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UploadIcon className="mr-2 h-4 w-4" />
                    )}
                    Importar {validCount} productos
                  </Button>
                  {!targetOrgId && (
                    <span className="text-xs text-muted-foreground">
                      Elige la organización destino
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {importResult && (
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="text-sm font-medium">
                  Importación completada: {importResult.success} exitosos,{" "}
                  {importResult.failed} fallidos
                </p>
                {importResult.failures.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-destructive">
                    {importResult.failures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
                {importResult.success > 0 && (
                  <Button
                    variant="link"
                    className="mt-1 p-0 h-auto"
                    onClick={() => router.push("/products")}
                  >
                    Ver productos →
                  </Button>
                )}
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
                  <TableHead className="text-center">Períodos</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.map((p) => {
                  const totalUnits = p.sales.reduce(
                    (a, s) => a + s.unitsSold,
                    0
                  );
                  return (
                    <TableRow key={p.sku}>
                      <TableCell>
                        {p.errors.length > 0 ? (
                          <span
                            className="inline-flex"
                            title={p.errors.join(" · ")}
                          >
                            <AlertCircleIcon className="h-4 w-4 text-destructive" />
                          </span>
                        ) : p.warnings.length > 0 ? (
                          <span
                            className="inline-flex"
                            title={p.warnings.join(" · ")}
                          >
                            <AlertTriangleIcon className="h-4 w-4 text-amber-500" />
                          </span>
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
                      <TableCell className="text-center">
                        {p.sales.length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {totalUnits > 0
                          ? totalUnits.toLocaleString("es-CL")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {issues.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">
                  Detalle de errores y avisos
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {issues.map((p) => (
                    <li key={p.sku}>
                      <span className="font-mono">{p.sku}</span>
                      {p.errors.map((m) => (
                        <span key={m} className="ml-2 text-destructive">
                          ✕ {m}
                        </span>
                      ))}
                      {p.warnings.map((m) => (
                        <span key={m} className="ml-2 text-amber-600">
                          ⚠ {m}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
