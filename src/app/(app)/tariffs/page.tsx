"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePriorityProduct } from "@/components/priority-product-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSignIcon,
  ExternalLinkIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";

export default function TariffsPage() {
  const { selected: pp } = usePriorityProduct();
  const { data: systems = [], refetch } = trpc.tariff.listSystems.useQuery(
    pp ? { priorityProductId: pp.id } : undefined
  );

  const createMut = trpc.tariff.createCategory.useMutation({ onSuccess: () => refetch() });
  const updateTariffMut = trpc.tariff.updateTariff.useMutation({ onSuccess: () => refetch() });
  const updateCatMut = trpc.tariff.updateCategory.useMutation({ onSuccess: () => refetch() });
  const deleteMut = trpc.tariff.deleteCategory.useMutation({ onSuccess: () => refetch() });

  const [addOpen, setAddOpen] = useState(false);
  const [addSystemId, setAddSystemId] = useState("");
  const [addForm, setAddForm] = useState({
    segment: "Domiciliario",
    material: "",
    subcategory: "",
    tariffType: "Normal",
    year: 2026,
    rate: "",
    rateUnit: "UF/ton",
    plusIva: false,
  });

  const [editingTariff, setEditingTariff] = useState<{ tariffId: string; categoryId: string } | null>(null);
  const [editRate, setEditRate] = useState("");

  // Pestaña activa derivada: cae en la primera mientras la elegida no esté en
  // la lista (al cargar, o al cambiar de producto prioritario)
  const [tab, setTab] = useState("");
  const activeTab = systems.some((s) => s.name === tab)
    ? tab
    : (systems[0]?.name ?? "");

  function openAdd(systemId: string) {
    setAddSystemId(systemId);
    setAddForm({ segment: "Domiciliario", material: "", subcategory: "", tariffType: "Normal", year: 2026, rate: "", rateUnit: "UF/ton", plusIva: false });
    setAddOpen(true);
  }

  function submitAdd() {
    createMut.mutate({
      systemId: addSystemId,
      segment: addForm.segment,
      material: addForm.material,
      subcategory: addForm.subcategory,
      tariffType: addForm.tariffType,
      year: addForm.year,
      rateUfPerTon: addForm.rate,
      rateUnit: addForm.rateUnit,
      plusIva: addForm.plusIva,
    });
    setAddOpen(false);
  }

  function startEdit(tariffId: string, categoryId: string, currentRate: string) {
    setEditingTariff({ tariffId, categoryId });
    setEditRate(currentRate);
  }

  function saveEdit() {
    if (!editingTariff) return;
    updateTariffMut.mutate({ tariffId: editingTariff.tariffId, rateUfPerTon: editRate });
    setEditingTariff(null);
  }

  function handleDelete(categoryId: string, name: string) {
    if (confirm(`¿Eliminar categoría "${name}"? Se borrarán también sus tarifas.`)) {
      deleteMut.mutate({ categoryId });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarifas</h1>
        <p className="text-muted-foreground mt-1">
          Tarifas vigentes por Sistema de Gestión Colectivo (UF/Ton)
        </p>
      </div>

      {systems.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay sistemas de gestión para este producto prioritario. Si acabas
          de cambiarlo, vuelve a elegirlo en la barra lateral.
        </p>
      )}

      {/*
        Controlado, no `defaultValue`: Radix lee defaultValue solo al montar, y
        los datos llegan después del primer render. Con defaultValue quedaba sin
        pestaña seleccionada y no se veía ningún contenido.
      */}
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {systems.map((sys) => (
            <TabsTrigger key={sys.id} value={sys.name} className="gap-1.5">
              {sys.name}
              <Badge variant="secondary" className="ml-1 text-xs">
                {sys.tariffCategories.length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {systems.map((sys) => {
          const bySegment = sys.tariffCategories.reduce(
            (acc, tc) => {
              if (!acc[tc.segment]) acc[tc.segment] = [];
              acc[tc.segment].push(tc);
              return acc;
            },
            {} as Record<string, typeof sys.tariffCategories>,
          );

          return (
            <TabsContent key={sys.id} value={sys.name} className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSignIcon className="h-5 w-5 text-primary" />
                        {sys.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {sys.priorityProduct} · {sys.observations}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {sys.tariffUrl && (
                        <a
                          href={sys.tariffUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          Ver tarifas oficiales
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button size="sm" onClick={() => openAdd(sys.id)}>
                        <PlusIcon className="mr-1 h-4 w-4" /> Agregar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {Object.entries(bySegment).map(([segment, categories]) => (
                <Card key={segment}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      Segmento: {segment}
                    </CardTitle>
                    <CardDescription>
                      {categories.length} categorías de tarifa
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Subcategoría</TableHead>
                          <TableHead>Tipo Tarifa</TableHead>
                          <TableHead className="text-right">Tarifa 2026</TableHead>
                          <TableHead className="w-[100px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categories.map((tc) => {
                          const currentTariff = tc.tariffs.find((t) => t.year === 2026);
                          const isEditing = editingTariff?.categoryId === tc.id;

                          return (
                            <TableRow key={tc.id}>
                              <TableCell className="font-medium">{tc.material}</TableCell>
                              <TableCell>{tc.subcategory}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-normal">
                                  {tc.tariffType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {isEditing && currentTariff ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Input
                                      value={editRate}
                                      onChange={(e) => setEditRate(e.target.value)}
                                      className="w-24 h-7 text-right text-xs"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveEdit();
                                        if (e.key === "Escape") setEditingTariff(null);
                                      }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                                      <CheckIcon className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTariff(null)}>
                                      <XIcon className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : currentTariff ? (
                                  `${Number(
                                    currentTariff.rateValue ?? currentTariff.rateUfPerTon,
                                  ).toLocaleString("es-CL", {
                                    minimumFractionDigits: currentTariff.rateUnit === "CLP/kg" ? 1 : 2,
                                    maximumFractionDigits: currentTariff.rateUnit === "CLP/kg" ? 1 : 2,
                                  })} ${currentTariff.rateUnit}${currentTariff.plusIva ? " +IVA" : ""}`
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 justify-end">
                                  {currentTariff && !isEditing && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        startEdit(
                                          currentTariff.id,
                                          tc.id,
                                          String(currentTariff.rateValue ?? currentTariff.rateUfPerTon),
                                        )
                                      }
                                    >
                                      <PencilIcon className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(tc.id, `${tc.material} - ${tc.subcategory}`)}
                                  >
                                    <TrashIcon className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Dialog: Agregar categoría + tarifa */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar categoría de tarifa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Segmento</Label>
                <Select value={addForm.segment} onValueChange={(v) => setAddForm((f) => ({ ...f, segment: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Domiciliario">Domiciliario</SelectItem>
                    <SelectItem value="No Domiciliario">No Domiciliario</SelectItem>
                    <SelectItem value="Único">Único</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo tarifa</Label>
                <Select value={addForm.tariffType} onValueChange={(v) => setAddForm((f) => ({ ...f, tariffType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Sin Grasa">Sin Grasa</SelectItem>
                    <SelectItem value="Con Grasa">Con Grasa</SelectItem>
                    <SelectItem value="Peligroso">Peligroso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Material</Label>
              <Input value={addForm.material} onChange={(e) => setAddForm((f) => ({ ...f, material: e.target.value }))} placeholder="Plásticos" />
            </div>
            <div className="space-y-1">
              <Label>Subcategoría</Label>
              <Input value={addForm.subcategory} onChange={(e) => setAddForm((f) => ({ ...f, subcategory: e.target.value }))} placeholder="Botellas PET" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Año</Label>
                <Input type="number" value={addForm.year} onChange={(e) => setAddForm((f) => ({ ...f, year: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Tarifa</Label>
                <Input value={addForm.rate} onChange={(e) => setAddForm((f) => ({ ...f, rate: e.target.value }))} placeholder="1.23" />
              </div>
              <div className="space-y-1">
                <Label>Unidad</Label>
                <Select value={addForm.rateUnit} onValueChange={(v) => setAddForm((f) => ({ ...f, rateUnit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF/ton">UF/ton</SelectItem>
                    <SelectItem value="CLP/kg">CLP/kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button onClick={submitAdd} disabled={!addForm.material || !addForm.subcategory || !addForm.rate || createMut.isPending}>
                {createMut.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
