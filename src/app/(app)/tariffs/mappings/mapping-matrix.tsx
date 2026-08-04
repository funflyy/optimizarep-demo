"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2Icon, CheckCircle2Icon } from "lucide-react";

interface MaterialItem {
  materialClass: string;
  materialDetail: string;
  isDomiciliary: boolean;
  /** El costo exige que el mapeo coincida en grasa y peligrosidad */
  hasGrease: boolean;
  isHazardous: boolean;
  count: number;
}

interface CategoryItem {
  id: string;
  subcategory: string;
  segment: string;
  tariffType: string;
}

interface SystemItem {
  id: string;
  name: string;
  tariffCategories: CategoryItem[];
}

interface MappingMatrixProps {
  materials: MaterialItem[];
  systems: SystemItem[];
}

export function MappingMatrix({ materials, systems }: MappingMatrixProps) {
  const utils = trpc.useUtils();
  const { data: dbMappings = [], isLoading: isLoadingMappings } =
    trpc.tariff.getMappings.useQuery();

  const saveMutation = trpc.tariff.saveMapping.useMutation({
    onSuccess: () => {
      utils.tariff.getMappings.invalidate();
      setSavedStatus("Mapeo guardado con éxito");
      setTimeout(() => setSavedStatus(""), 3000);
    },
    onError: (err) => {
      setSavedStatus(`Error: ${err.message}`);
      setTimeout(() => setSavedStatus(""), 4000);
    },
  });

  const deleteMutation = trpc.tariff.deleteMapping.useMutation({
    onSuccess: () => {
      utils.tariff.getMappings.invalidate();
      setSavedStatus("Mapeo eliminado con éxito");
      setTimeout(() => setSavedStatus(""), 3000);
    },
  });

  const [savedStatus, setSavedStatus] = useState("");

  const handleMappingChange = async (
    systemId: string,
    mat: MaterialItem,
    segment: string,
    tariffCategoryId: string
  ) => {
    const key = {
      systemId,
      materialDetail: mat.materialDetail,
      segment,
      hasGrease: mat.hasGrease,
      isHazardous: mat.isHazardous,
    };
    if (tariffCategoryId === "none") {
      await deleteMutation.mutateAsync(key);
    } else {
      await saveMutation.mutateAsync({ ...key, tariffCategoryId });
    }
  };

  /** Categoría que el sistema sugiere por nombre, para un material y SIG */
  const suggestFor = (mat: MaterialItem, sys: SystemItem, segment: string) => {
    const detail = mat.materialDetail.toLowerCase();
    const grasa = mat.hasGrease ? "con grasa" : "sin grasa";
    const candidates = sys.tariffCategories.filter(
      (tc) =>
        (tc.segment === segment || tc.segment === "Único") &&
        (tc.subcategory.toLowerCase().includes(detail) ||
          detail.includes(tc.subcategory.toLowerCase()))
    );
    if (candidates.length === 0) return undefined;
    // Preferir la variante que coincide con la grasa, y evitar "Peligroso"
    // salvo que la pieza lo sea: son tarifas bastante más altas.
    const byGrease = candidates.filter((tc) =>
      tc.subcategory.toLowerCase().includes(grasa)
    );
    const pool = byGrease.length > 0 ? byGrease : candidates;
    const byHazard = pool.filter((tc) =>
      mat.isHazardous
        ? tc.tariffType === "Peligroso"
        : tc.tariffType !== "Peligroso"
    );
    return (byHazard.length > 0 ? byHazard : pool)[0];
  };

  /**
   * Sugerencias que aún no están guardadas.
   *
   * La pre-selección se mostraba en verde pero NO se escribía en la base, así
   * que la pantalla parecía completa y el costo seguía en cero: el cálculo hace
   * join contra tariff_mappings. Este botón las persiste de una vez.
   */
  const pending = materials.flatMap((mat) => {
    const segment = mat.isDomiciliary ? "Domiciliario" : "No Domiciliario";
    return systems.flatMap((sys) => {
      const saved = dbMappings.find(
        (m) =>
          m.systemId === sys.id &&
          m.materialDetail === mat.materialDetail &&
          m.segment === segment &&
          m.hasGrease === mat.hasGrease &&
          m.isHazardous === mat.isHazardous
      );
      if (saved) return [];
      const suggestion = suggestFor(mat, sys, segment);
      return suggestion ? [{ mat, sys, segment, suggestion }] : [];
    });
  });

  async function applySuggestions() {
    for (const { mat, sys, segment, suggestion } of pending) {
      await saveMutation.mutateAsync({
        systemId: sys.id,
        materialDetail: mat.materialDetail,
        segment,
        hasGrease: mat.hasGrease,
        isHazardous: mat.isHazardous,
        tariffCategoryId: suggestion.id,
      });
    }
    setSavedStatus(`${pending.length} sugerencias guardadas`);
    setTimeout(() => setSavedStatus(""), 3000);
  }

  return (
    <div className="space-y-4">
      {savedStatus && (
        <div className="flex items-center gap-2 p-3 text-sm rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium animate-in fade-in duration-200">
          <CheckCircle2Icon className="h-4 w-4" />
          <span>{savedStatus}</span>
        </div>
      )}

      {/* Las sugerencias en verde no cuentan para el costo hasta guardarse */}
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm">
            <span className="font-medium">
              {pending.length} sugerencias sin guardar.
            </span>{" "}
            <span className="text-muted-foreground">
              Las celdas verdes son propuestas del sistema: no afectan el costo
              hasta que se guarden.
            </span>
          </p>
          <Button
            size="sm"
            onClick={applySuggestions}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2Icon className="mr-1 h-3 w-3 animate-spin" />
            ) : null}
            Guardar las {pending.length}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Grasa</TableHead>
              <TableHead className="text-center">Piezas</TableHead>
              {systems.map((sys) => (
                <TableHead key={sys.id} className="min-w-[180px]">
                  {sys.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((mat, i) => {
              const segment = mat.isDomiciliary ? "Domiciliario" : "No Domiciliario";

              return (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{mat.materialClass}</TableCell>
                  <TableCell className="text-sm">{mat.materialDetail}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {segment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {mat.hasGrease ? (
                      <Badge
                        variant="outline"
                        className="text-xs font-normal border-amber-500/40 text-amber-600 dark:text-amber-500"
                      >
                        Con grasa
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {mat.isHazardous && (
                      <Badge variant="destructive" className="ml-1 text-xs">
                        Peligroso
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">{mat.count}</TableCell>
                  {systems.map((sys) => {
                    const systemCategories = sys.tariffCategories.filter(
                      (tc) => tc.segment === segment || tc.segment === "Único"
                    );
                    const hasDupes = systemCategories.some(
                      (tc, idx) =>
                        systemCategories.findIndex(
                          (o) => o.subcategory === tc.subcategory
                        ) !== idx
                    );

                    // 1. Mapeo guardado en la base. Debe coincidir también en
                    // grasa y peligrosidad, igual que el join del cálculo.
                    const currentMapping = dbMappings.find(
                      (m) =>
                        m.systemId === sys.id &&
                        m.materialDetail === mat.materialDetail &&
                        m.segment === segment &&
                        m.hasGrease === mat.hasGrease &&
                        m.isHazardous === mat.isHazardous
                    );

                    // 2. Si no hay, la sugerencia por nombre (solo visual
                    // hasta que se guarde con el botón o a mano)
                    const autoMatch = !currentMapping
                      ? suggestFor(mat, sys, segment)
                      : null;

                    const selectedValue = currentMapping
                      ? currentMapping.tariffCategoryId
                      : autoMatch
                        ? autoMatch.id
                        : "none";

                    return (
                      <TableCell key={sys.id} className="p-2">
                        {isLoadingMappings ? (
                          <div className="flex items-center justify-center h-8">
                            <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <Select
                            value={selectedValue}
                            onValueChange={(val) =>
                              handleMappingChange(sys.id, mat, segment, val)
                            }
                          >
                            <SelectTrigger
                              className={`w-full text-xs h-8 ${
                                !currentMapping && autoMatch
                                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 font-medium"
                                  : currentMapping
                                    ? "border-primary bg-primary/5 text-primary font-medium"
                                    : "text-muted-foreground"
                              }`}
                            >
                              <SelectValue placeholder="Sin mapear" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              <SelectItem value="none" className="text-muted-foreground text-xs">
                                Sin mapear
                              </SelectItem>
                              {systemCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                  {cat.subcategory}
                                  {hasDupes ? ` (${cat.tariffType})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
