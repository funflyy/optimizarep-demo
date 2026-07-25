"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Piece {
  id: string;
  pieceName: string;
  packagingType: "primary" | "secondary" | "tertiary";
  isDomiciliary: boolean;
  materialClass: string;
  wasteType: "recyclable" | "non_recyclable";
  materialDetail: string;
  weightGrams: number;
  hasGrease: boolean;
  isHazardous: boolean;
}

interface SalesRecord {
  id: string;
  year: number;
  unitsSold: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  pieces: Piece[];
  salesRecords: SalesRecord[];
}

const PACKAGING_LABELS: Record<string, string> = {
  primary: "Primario",
  secondary: "Secundario",
  tertiary: "Terciario",
};

export function ProductRow({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false);
  const totalWeight = product.pieces.reduce((a, p) => a + p.weightGrams, 0);
  const latestSales = product.salesRecords[0];

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-mono text-sm">{product.sku}</TableCell>
        <TableCell className="font-medium max-w-[250px] truncate">
          {product.name}
        </TableCell>
        <TableCell>{product.brand || "—"}</TableCell>
        <TableCell>
          {product.category && (
            <Badge variant="secondary" className="font-normal">
              {product.category}
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-center">{product.pieces.length}</TableCell>
        <TableCell className="text-right font-mono">
          {totalWeight.toFixed(1)}
        </TableCell>
        <TableCell className="text-right font-mono">
          {latestSales
            ? latestSales.unitsSold.toLocaleString("es-CL")
            : "—"}
        </TableCell>
      </TableRow>

      {/* Expanded: Pieces detail */}
      {expanded && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={8} className="p-0">
            <div className="px-8 py-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Piezas del envase
              </p>
              <div className="grid gap-2">
                {product.pieces.map((piece) => (
                  <div
                    key={piece.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{piece.pieceName}</span>
                      <Badge
                        variant="outline"
                        className="text-xs font-normal"
                      >
                        {PACKAGING_LABELS[piece.packagingType] ||
                          piece.packagingType}
                      </Badge>
                      <Badge
                        variant={
                          piece.wasteType === "recyclable"
                            ? "default"
                            : "destructive"
                        }
                        className={
                          piece.wasteType === "recyclable"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-xs"
                            : "text-xs"
                        }
                      >
                        {piece.wasteType === "recyclable"
                          ? "Reciclable"
                          : "No Recicl."}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>
                        <strong className="text-foreground">
                          {piece.materialClass}
                        </strong>{" "}
                        → {piece.materialDetail}
                      </span>
                      <span className="font-mono text-foreground">
                        {piece.weightGrams}g
                      </span>
                      {piece.isDomiciliary && (
                        <Badge variant="outline" className="text-xs">
                          DOM
                        </Badge>
                      )}
                      {piece.hasGrease && (
                        <Badge
                          variant="outline"
                          className="text-xs text-amber-600 border-amber-300"
                        >
                          Grasa
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
