"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  Loader2Icon,
} from "lucide-react";
import Link from "next/link";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

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
  /** Copiada desde otro SKU */
  isReplica?: boolean;
  originalSku?: string | null;
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

export function ProductRow({
  product,
  candidates = [],
}: {
  product: Product;
  /** Otros SKU con piezas, para copiar desde ellos */
  candidates?: { id: string; sku: string; name: string; pieceCount: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [replicaOpen, setReplicaOpen] = useState(false);
  const [sourceSku, setSourceSku] = useState("");
  const totalWeight = product.pieces.reduce((a, p) => a + p.weightGrams, 0);
  const latestSales = product.salesRecords[0];

  /** Si las piezas vinieron de otro SKU, de cuál */
  const replicatedFrom = product.pieces.find((p) => p.isReplica)?.originalSku;

  const utils = trpc.useUtils();
  const replicate = trpc.product.replicatePieces.useMutation({
    onSuccess: () => {
      utils.product.list.invalidate();
      setReplicaOpen(false);
      setSourceSku("");
    },
  });

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
          {replicatedFrom && (
            <Badge
              variant="outline"
              className="ml-2 text-xs font-normal font-mono"
              title={`Piezas copiadas del SKU ${replicatedFrom}`}
            >
              réplica de {replicatedFrom}
            </Badge>
          )}
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Piezas del envase
                  {replicatedFrom && (
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      copiadas del SKU{" "}
                      <span className="font-mono">{replicatedFrom}</span>
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/products/${product.id}/edit`}>
                      <PencilIcon className="mr-1 h-3 w-3" />
                      Editar SKU
                    </Link>
                  </Button>
                  {candidates.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplicaOpen(true);
                      }}
                    >
                      <CopyIcon className="mr-1 h-3 w-3" />
                      {product.pieces.length === 0
                        ? "Copiar piezas de otro SKU"
                        : "Reemplazar por las de otro SKU"}
                    </Button>
                  )}
                </div>
              </div>

              {product.pieces.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin piezas declaradas. Si este envase es igual al de otro SKU,
                  cópialas en vez de volver a cargarlas.
                </p>
              )}
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

      {/* Replicar piezas desde otro SKU: el mismo envase se repite en muchos
          SKU y volver a declararlo pieza por pieza duplica el trabajo */}
      <Dialog open={replicaOpen} onOpenChange={setReplicaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copiar piezas a {product.sku}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se copiarán todas las piezas del SKU que elijas
              {product.pieces.length > 0 && (
                <>
                  {" "}
                  y se <strong>reemplazarán</strong> las {product.pieces.length}{" "}
                  actuales de {product.sku}
                </>
              )}
              . Quedan marcadas como réplica para saber de dónde vienen.
            </p>

            <Select value={sourceSku} onValueChange={setSourceSku}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue
                  placeholder="Elegir SKU de origen..."
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-w-[min(90vw,28rem)]">
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.sku}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-xs shrink-0">{c.sku}</span>
                      <span className="truncate text-muted-foreground">
                        {c.name}
                      </span>
                      <span className="text-xs shrink-0">
                        {c.pieceCount} pzas
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {replicate.error && (
              <p className="text-sm text-destructive">
                {replicate.error.message}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReplicaOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!sourceSku || replicate.isPending}
                onClick={() =>
                  replicate.mutate({
                    targetProductId: product.id,
                    sourceSku,
                  })
                }
              >
                {replicate.isPending && (
                  <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
                )}
                Copiar piezas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
