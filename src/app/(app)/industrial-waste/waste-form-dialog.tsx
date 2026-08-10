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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusIcon, Loader2Icon } from "lucide-react";

interface LerCode {
  id: string;
  code: string;
  description: string;
}

const VACIO = {
  wasteDate: "",
  lerCode: "",
  wasteName: "",
  handlerRut: "",
  handlerName: "",
  destinationPlant: "",
  singleWindowId: "",
  treatmentCode: "",
  treatmentDescription: "",
  totalKg: "",
  observations: "",
};

/**
 * Registro de un retiro de residuo industrial.
 *
 * Los campos son los del formato SINADER que definió MB. Al elegir el código
 * LER se propone su descripción como nombre del residuo, que es lo habitual,
 * pero se puede editar: el gestor a veces usa una denominación más específica.
 */
export function WasteFormDialog({ lerCatalog }: { lerCatalog: LerCode[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...VACIO });

  const utils = trpc.useUtils();
  const create = trpc.industrialWaste.create.useMutation({
    onSuccess: () => {
      utils.industrialWaste.list.invalidate();
      utils.industrialWaste.summaryByLer.invalidate();
      utils.industrialWaste.availableYears.invalidate();
      setForm({ ...VACIO });
      setOpen(false);
    },
  });

  const set = (k: keyof typeof VACIO, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const puedeGuardar =
    form.wasteDate &&
    form.lerCode &&
    form.wasteName.trim() &&
    Number(form.totalKg) > 0 &&
    !create.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="mr-2 h-4 w-4" />
          Registrar retiro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar retiro de residuo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wasteDate">Fecha del retiro *</Label>
              <Input
                id="wasteDate"
                type="date"
                value={form.wasteDate}
                onChange={(e) => set("wasteDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalKg">Kilos totales *</Label>
              <Input
                id="totalKg"
                type="number"
                min="0"
                step="0.001"
                value={form.totalKg}
                onChange={(e) => set("totalKg", e.target.value)}
                placeholder="15,93"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lerCode">Código LER *</Label>
            <Select
              value={form.lerCode}
              onValueChange={(v) => {
                set("lerCode", v);
                // Propone la descripción del catálogo si el campo está vacío
                const l = lerCatalog.find((x) => x.code === v);
                if (l && !form.wasteName.trim()) set("wasteName", l.description);
              }}
            >
              <SelectTrigger id="lerCode" className="w-full min-w-0">
                <SelectValue placeholder="Elegir código LER…" />
              </SelectTrigger>
              <SelectContent className="max-w-[min(90vw,32rem)]">
                {lerCatalog.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-mono text-xs shrink-0">
                        {l.code}
                      </span>
                      <span className="truncate">{l.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wasteName">Residuo *</Label>
            <Input
              id="wasteName"
              value={form.wasteName}
              onChange={(e) => set("wasteName", e.target.value)}
              placeholder="Envases de vidrio"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="handlerRut">RUT gestor receptor</Label>
              <Input
                id="handlerRut"
                value={form.handlerRut}
                onChange={(e) => set("handlerRut", e.target.value)}
                placeholder="12345678-9"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handlerName">Nombre del gestor</Label>
              <Input
                id="handlerName"
                value={form.handlerName}
                onChange={(e) => set("handlerName", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="destinationPlant">Planta destino</Label>
              <Input
                id="destinationPlant"
                value={form.destinationPlant}
                onChange={(e) => set("destinationPlant", e.target.value)}
                placeholder="BODEGA DE INGRESOS VIDRIO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="singleWindowId">ID Ventanilla Única</Label>
              <Input
                id="singleWindowId"
                value={form.singleWindowId}
                onChange={(e) => set("singleWindowId", e.target.value)}
                placeholder="9876485"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="treatmentCode">Cód. tratamiento</Label>
              <Input
                id="treatmentCode"
                value={form.treatmentCode}
                onChange={(e) => set("treatmentCode", e.target.value)}
                placeholder="19"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="treatmentDescription">
                Descripción del tratamiento
              </Label>
              <Input
                id="treatmentDescription"
                value={form.treatmentDescription}
                onChange={(e) => set("treatmentDescription", e.target.value)}
                placeholder="Reciclaje de vidrio"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={form.observations}
              onChange={(e) => set("observations", e.target.value)}
              rows={2}
            />
          </div>

          {create.error && (
            <p className="text-sm text-destructive">{create.error.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!puedeGuardar}
              onClick={() =>
                create.mutate({
                  wasteDate: new Date(form.wasteDate),
                  lerCode: form.lerCode,
                  wasteName: form.wasteName.trim(),
                  handlerRut: form.handlerRut.trim() || undefined,
                  handlerName: form.handlerName.trim() || undefined,
                  destinationPlant: form.destinationPlant.trim() || undefined,
                  singleWindowId: form.singleWindowId.trim() || undefined,
                  treatmentCode: form.treatmentCode.trim() || undefined,
                  treatmentDescription:
                    form.treatmentDescription.trim() || undefined,
                  totalKg: Number(form.totalKg),
                  observations: form.observations.trim() || undefined,
                })
              }
            >
              {create.isPending && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
