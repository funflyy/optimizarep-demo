"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { appendStampSheet, stampedFilename } from "@/lib/report-stamp";
import { useReportContext } from "@/hooks/use-report-context";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  /** Base del nombre; se le agrega la fecha y hora al descargar */
  filename: string;
  label?: string;
  /** Nombre del reporte para la hoja de procedencia */
  report?: string;
  /** Filtros aplicados, para distinguir este archivo de otro igual */
  scope?: Record<string, string | number | null | undefined>;
  sheetName?: string;
}

export function ExcelExportButton({
  data,
  filename,
  label = "Exportar Excel",
  report,
  scope,
  sheetName = "Datos",
}: ExportButtonProps) {
  const ctx = useReportContext(report ?? filename.replace(/_/g, " "), scope);

  async function handleExport() {
    const XLSX = await import("xlsx");
    const now = new Date();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    appendStampSheet(XLSX, wb, ctx, now);
    XLSX.writeFile(wb, `${stampedFilename(filename, now)}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <DownloadIcon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
