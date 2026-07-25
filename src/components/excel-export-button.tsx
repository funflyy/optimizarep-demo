"use client";

import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

export function ExcelExportButton({
  data,
  filename,
  label = "Exportar Excel",
}: ExportButtonProps) {
  async function handleExport() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <DownloadIcon className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
