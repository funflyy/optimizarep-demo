"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CopyPlusIcon, Loader2Icon, CheckCircle2Icon } from "lucide-react";

/**
 * Crear un SKU nuevo a partir de otro.
 *
 * Muchos SKU comparten exactamente el mismo envase (la misma botella para diez
 * sabores), así que declararlo pieza por pieza cada vez es trabajo duplicado.
 * No copia las ventas: el volumen es propio de cada SKU.
 */
export function DuplicateSkuDialog({
  sources,
  defaultSourceSku,
}: {
  /** SKU desde los que se puede copiar, con su cantidad de piezas */
  sources: { sku: string; name: string; pieceCount: number }[];
  defaultSourceSku?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sourceSku, setSourceSku] = useState(defaultSourceSku ?? "");
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");

  const utils = trpc.useUtils();
  const duplicate = trpc.product.duplicateFrom.useMutation({
    onSuccess: () => {
      utils.product.list.invalidate();
      utils.product.replicaStats.invalidate();
      setNewSku("");
      setNewName("");
      setOpen(false);
    },
  });

  const source = sources.find((s) => s.sku === sourceSku);
  const puedeGuardar =
    sourceSku && newSku.trim() && newName.trim() && !duplicate.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={sources.length === 0}>
          <CopyPlusIcon className="mr-2 h-4 w-4" />
          Duplicar SKU
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear un SKU a partir de otro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Se copia el envase completo —piezas, materiales, pesos y
            clasificación— y queda marcado como réplica. Las{" "}
            <span className="font-medium">ventas no se copian</span>: el volumen
            es propio de cada SKU.
          </p>

          <div className="space-y-2">
            <Label htmlFor="source">Copiar el envase de</Label>
            <Select value={sourceSku} onValueChange={setSourceSku}>
              <SelectTrigger id="source" className="w-full min-w-0">
                <SelectValue
                  placeholder="Elegir SKU de origen…"
                  className="truncate"
                />
              </SelectTrigger>
              <SelectContent className="max-w-[min(90vw,28rem)]">
                {sources.map((s) => (
                  <SelectItem key={s.sku} value={s.sku}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-xs shrink-0">{s.sku}</span>
                      <span className="truncate text-muted-foreground">
                        {s.name}
                      </span>
                      <span className="text-xs shrink-0">
                        {s.pieceCount} pzas
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {source && (
              <p className="text-xs text-muted-foreground">
                Se copiarán{" "}
                <Badge variant="secondary">{source.pieceCount} piezas</Badge>
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newSku">SKU nuevo</Label>
              <Input
                id="newSku"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="50000999"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newName">Nombre del producto</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Yogurt Frutilla 1kg"
              />
            </div>
          </div>

          {duplicate.error && (
            <p className="text-sm text-destructive">
              {duplicate.error.message}
            </p>
          )}
          {duplicate.isSuccess && (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2Icon className="h-4 w-4" />
              SKU creado
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!puedeGuardar}
              onClick={() =>
                duplicate.mutate({
                  sourceSku,
                  newSku: newSku.trim(),
                  newName: newName.trim(),
                })
              }
            >
              {duplicate.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Crear SKU
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
