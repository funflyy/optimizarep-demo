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
    materialDetail: string,
    segment: string,
    tariffCategoryId: string
  ) => {
    if (tariffCategoryId === "none") {
      await deleteMutation.mutateAsync({
        systemId,
        materialDetail,
        segment,
      });
    } else {
      await saveMutation.mutateAsync({
        systemId,
        materialDetail,
        segment,
        tariffCategoryId,
      });
    }
  };

  return (
    <div className="space-y-4">
      {savedStatus && (
        <div className="flex items-center gap-2 p-3 text-sm rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium animate-in fade-in duration-200">
          <CheckCircle2Icon className="h-4 w-4" />
          <span>{savedStatus}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Segmento</TableHead>
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
                  <TableCell className="text-center font-mono text-xs">{mat.count}</TableCell>
                  {systems.map((sys) => {
                    const systemCategories = sys.tariffCategories.filter(
                      (tc) => tc.segment === segment
                    );
                    const hasDupes = systemCategories.some(
                      (tc, idx) =>
                        systemCategories.findIndex(
                          (o) => o.subcategory === tc.subcategory
                        ) !== idx
                    );

                    // 1. Check if there is a manually saved mapping in the DB
                    const currentMapping = dbMappings.find(
                      (m) =>
                        m.systemId === sys.id &&
                        m.materialDetail === mat.materialDetail &&
                        m.segment === segment
                    );

                    // 2. If not, use automatic lookup fallback
                    const autoMatch = !currentMapping
                      ? sys.tariffCategories.find(
                          (tc) =>
                            tc.segment === segment &&
                            (tc.subcategory.toLowerCase().includes(mat.materialDetail.toLowerCase()) ||
                              mat.materialDetail.toLowerCase().includes(tc.subcategory.toLowerCase()))
                        )
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
                              handleMappingChange(sys.id, mat.materialDetail, segment, val)
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
