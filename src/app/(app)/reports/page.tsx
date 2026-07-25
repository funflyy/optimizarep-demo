"use client";

import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileTextIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
  Loader2Icon,
  CheckCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { useProductType } from "@/hooks/use-product-type";

export default function ReportsPage() {
  const productType = useProductType();
  const { data } = trpc.product.list.useQuery({
    productType: productType ?? undefined,
  });
  const allProducts = data?.products ?? [];

  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  async function exportSinader() {
    setExporting("sinader");
    const XLSX = await import("xlsx");

    // Hoja 1: Productos
    const prodRows = allProducts.map((p) => ({
      SKU: p.sku,
      Producto: p.name,
      Marca: p.brand || "",
      Categoría: p.category || "",
      "Nº Piezas": p.pieces.length,
      "Peso Total (g)": p.pieces
        .reduce((a, pc) => a + pc.weightGrams, 0)
        .toFixed(1),
      "Ventas (unidades)": p.salesRecords[0]?.unitsSold ?? "",
    }));

    // Hoja 2: Piezas (detallado)
    const pieceRows = allProducts.flatMap((p) =>
      p.pieces.map((pc) => ({
        SKU: p.sku,
        Producto: p.name,
        Pieza: pc.pieceName,
        "Tipo Envase":
          pc.packagingType === "primary"
            ? "Primario"
            : pc.packagingType === "secondary"
              ? "Secundario"
              : "Terciario",
        Segmento: pc.isDomiciliary ? "Domiciliario" : "No Domiciliario",
        Material: pc.materialClass,
        "Detalle Material": pc.materialDetail,
        "Peso (g)": pc.weightGrams,
        "Tipo Residuo":
          pc.wasteType === "recyclable" ? "Reciclable" : "No Reciclable",
        "Presencia Grasa": pc.hasGrease ? "Sí" : "No",
        Peligroso: pc.isHazardous ? "Sí" : "No",
      }))
    );

    // Hoja 3: POM por Material
    const materialMap = new Map<
      string,
      { material: string; detail: string; pieces: number; totalWeight: number; segment: string }
    >();
    for (const p of allProducts) {
      const sales = p.salesRecords[0]?.unitsSold ?? 0;
      for (const pc of p.pieces) {
        const key = `${pc.materialClass}|${pc.materialDetail}|${pc.isDomiciliary}`;
        const existing = materialMap.get(key);
        const pomTons = (pc.weightGrams * sales) / 1_000_000;
        if (existing) {
          existing.pieces++;
          existing.totalWeight += pomTons;
        } else {
          materialMap.set(key, {
            material: pc.materialClass,
            detail: pc.materialDetail,
            pieces: 1,
            totalWeight: pomTons,
            segment: pc.isDomiciliary ? "Domiciliario" : "No Domiciliario",
          });
        }
      }
    }
    const pomRows = Array.from(materialMap.values()).map((m) => ({
      Material: m.material,
      "Detalle Material": m.detail,
      Segmento: m.segment,
      "Nº Piezas": m.pieces,
      "POM (Ton)": m.totalWeight.toFixed(4),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(prodRows),
      "Productos"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pieceRows),
      "Piezas"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pomRows),
      "POM por Material"
    );
    XLSX.writeFile(wb, "Declaracion_SINADER_2024.xlsx");
    setExporting(null);
    setExported("sinader");
    setTimeout(() => setExported(null), 3000);
  }

  async function exportBBDD() {
    setExporting("bbdd");
    const XLSX = await import("xlsx");

    const rows = allProducts.flatMap((p) =>
      p.pieces.map((pc) => ({
        SKU: p.sku,
        Producto: p.name,
        Marca: p.brand || "",
        Categoría: p.category || "",
        Pieza: pc.pieceName,
        TipoEnvase:
          pc.packagingType === "primary"
            ? "Primario"
            : pc.packagingType === "secondary"
              ? "Secundario"
              : "Terciario",
        Domiciliario: pc.isDomiciliary ? "Sí" : "No",
        Material: pc.materialClass,
        DetalleMaterial: pc.materialDetail,
        "Peso(g)": pc.weightGrams,
        TipoResiduo:
          pc.wasteType === "recyclable" ? "Reciclable" : "No Reciclable",
        Grasa: pc.hasGrease ? "Sí" : "No",
        Peligroso: pc.isHazardous ? "Sí" : "No",
        Ventas: p.salesRecords[0]?.unitsSold ?? "",
        AñoVentas: p.salesRecords[0]?.year ?? "",
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "BBDD");
    XLSX.writeFile(wb, "BBDD_Productos_OptimizaREP.xlsx");
    setExporting(null);
    setExported("bbdd");
    setTimeout(() => setExported(null), 3000);
  }

  async function exportPDF() {
    setExporting("pdf");
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── Cover / Header ──
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.text("OptimizaREP — Reporte Ejecutivo", 14, 22);
    doc.setFontSize(12);
    doc.text(`Generado: ${dateStr}`, 14, 33);
    doc.setTextColor(0, 0, 0);

    // ── Resumen ──
    const totalPieces = allProducts.reduce((a, p) => a + p.pieces.length, 0);
    const withSales = allProducts.filter((p) => p.salesRecords.length > 0).length;
    const uniqueMaterials = new Set(
      allProducts.flatMap((p) => p.pieces.map((pc) => pc.materialDetail))
    ).size;

    doc.setFontSize(16);
    doc.text("Resumen General", 14, 55);
    autoTable(doc, {
      startY: 60,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total SKUs", String(allProducts.length)],
        ["Total Piezas", String(totalPieces)],
        ["Con Ventas Registradas", String(withSales)],
        ["Materiales Únicos", String(uniqueMaterials)],
      ],
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 10 },
      margin: { left: 14 },
      tableWidth: 120,
    });

    // ── Tabla de Productos ──
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Listado de Productos", 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [["SKU", "Producto", "Marca", "Categoría", "Piezas", "Peso (g)", "Ventas"]],
      body: allProducts.map((p) => [
        p.sku,
        p.name.substring(0, 40),
        p.brand || "-",
        p.category || "-",
        String(p.pieces.length),
        p.pieces.reduce((a, pc) => a + pc.weightGrams, 0).toFixed(1),
        p.salesRecords[0]?.unitsSold
          ? Number(p.salesRecords[0].unitsSold).toLocaleString("es-CL")
          : "-",
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    // ── Tabla de Piezas ──
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Desglose de Piezas", 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [["SKU", "Pieza", "Material", "Detalle", "Peso (g)", "Segmento", "Residuo"]],
      body: allProducts.flatMap((p) =>
        p.pieces.map((pc) => [
          p.sku,
          pc.pieceName,
          pc.materialClass,
          pc.materialDetail,
          String(pc.weightGrams),
          pc.isDomiciliary ? "DOM" : "NO DOM",
          pc.wasteType === "recyclable" ? "Reciclable" : "No Recicl.",
        ])
      ),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
    });

    // ── POM por Material ──
    const materialMap = new Map<
      string,
      { material: string; detail: string; totalWeight: number; segment: string; pieces: number }
    >();
    for (const p of allProducts) {
      const sales = p.salesRecords[0]?.unitsSold ?? 0;
      for (const pc of p.pieces) {
        const key = `${pc.materialClass}|${pc.materialDetail}|${pc.isDomiciliary}`;
        const existing = materialMap.get(key);
        const pomTons = (pc.weightGrams * Number(sales)) / 1_000_000;
        if (existing) {
          existing.pieces++;
          existing.totalWeight += pomTons;
        } else {
          materialMap.set(key, {
            material: pc.materialClass,
            detail: pc.materialDetail,
            pieces: 1,
            totalWeight: pomTons,
            segment: pc.isDomiciliary ? "Domiciliario" : "No Domiciliario",
          });
        }
      }
    }
    doc.addPage();
    doc.setFontSize(16);
    doc.text("POM por Material", 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [["Material", "Detalle", "Segmento", "Piezas", "POM (Ton)"]],
      body: Array.from(materialMap.values()).map((m) => [
        m.material,
        m.detail,
        m.segment,
        String(m.pieces),
        m.totalWeight.toFixed(4),
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 9 },
      margin: { left: 14, right: 14 },
    });

    // ── Footer en todas las páginas ──
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `OptimizaREP — Reporte Ejecutivo | ${dateStr} | Página ${i} de ${totalPages}`,
        pageW / 2,
        pageH - 8,
        { align: "center" }
      );
    }

    doc.save("Reporte_Ejecutivo_OptimizaREP.pdf");
    setExporting(null);
    setExported("pdf");
    setTimeout(() => setExported(null), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground mt-1">
          Generación de declaraciones y reportes para el RETC
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheetIcon className="h-5 w-5 text-emerald-600" />
              Declaración SINADER
            </CardTitle>
            <CardDescription>
              Genera Excel con 3 hojas: Productos, Piezas detalladas, y POM
              por Material para la Ventanilla Única RETC
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              className="w-full"
              onClick={exportSinader}
              disabled={exporting === "sinader" || allProducts.length === 0}
            >
              {exporting === "sinader" ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : exported === "sinader" ? (
                <CheckCircleIcon className="mr-2 h-4 w-4" />
              ) : (
                <DownloadIcon className="mr-2 h-4 w-4" />
              )}
              {exported === "sinader"
                ? "¡Descargado!"
                : `Generar SINADER (${allProducts.length} SKUs)`}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5 text-blue-600" />
              Reporte PDF
            </CardTitle>
            <CardDescription>
              Resumen ejecutivo con gráficos, tablas y costos por SIG
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="secondary"
              className="w-full"
              onClick={exportPDF}
              disabled={exporting === "pdf" || allProducts.length === 0}
            >
              {exporting === "pdf" ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : exported === "pdf" ? (
                <CheckCircleIcon className="mr-2 h-4 w-4" />
              ) : (
                <DownloadIcon className="mr-2 h-4 w-4" />
              )}
              {exported === "pdf"
                ? "¡Descargado!"
                : `Generar PDF (${allProducts.length} SKUs)`}
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheetIcon className="h-5 w-5 text-amber-600" />
              Exportar BBDD
            </CardTitle>
            <CardDescription>
              Exporta todos los productos con piezas a un Excel compatible con
              el formato de importación
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              variant="secondary"
              className="w-full"
              onClick={exportBBDD}
              disabled={exporting === "bbdd" || allProducts.length === 0}
            >
              {exporting === "bbdd" ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : exported === "bbdd" ? (
                <CheckCircleIcon className="mr-2 h-4 w-4" />
              ) : (
                <DownloadIcon className="mr-2 h-4 w-4" />
              )}
              {exported === "bbdd"
                ? "¡Descargado!"
                : `Exportar BBDD (${allProducts.length} SKUs)`}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      {allProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resumen de Datos</CardTitle>
            <CardDescription>
              Datos que serán incluidos en los reportes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 text-sm">
              <div>
                <p className="text-muted-foreground">Productos</p>
                <p className="text-2xl font-bold">{allProducts.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Piezas</p>
                <p className="text-2xl font-bold">
                  {allProducts.reduce((a, p) => a + p.pieces.length, 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Con Ventas</p>
                <p className="text-2xl font-bold">
                  {allProducts.filter((p) => p.salesRecords.length > 0).length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Materiales Únicos</p>
                <p className="text-2xl font-bold">
                  {
                    new Set(
                      allProducts.flatMap((p) =>
                        p.pieces.map((pc) => pc.materialDetail)
                      )
                    ).size
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
