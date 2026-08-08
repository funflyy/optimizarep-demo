"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { usePriorityProduct } from "@/components/priority-product-context";
import { MONTH_NAMES } from "@/components/month-filter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  PlusIcon,
  TrashIcon,
  SaveIcon,
  ArrowLeftIcon,
  PackageIcon,
  LayersIcon,
  ScaleIcon,
} from "lucide-react";
import Link from "next/link";

interface PieceForm {
  pieceName: string;
  packagingType: "primary" | "secondary" | "tertiary";
  isDomiciliary: boolean;
  materialClass: string;
  wasteType: "recyclable" | "non_recyclable";
  materialDetail: string;
  /** Peso en la unidad nativa del producto prioritario (g, kg o L) */
  weightNative: number;
  repCategoryId?: string;
  hasGrease: boolean;
  isHazardous: boolean;
  /** Fuera del régimen REP: se declara pero no paga tarifa */
  notSubjectToRep: boolean;
  exemptionReason: string;
  /** % de material reciclado incorporado; vacío = no declarado */
  recycledPercentage: string;
  recycledOrigin: "" | "nacional" | "importado";
}

/** Venta declarada de un período; el usuario solo edita las unidades */
interface SaleForm {
  year: number;
  month: number;
  segment: "Domiciliario" | "No Domiciliario";
  unitsSold: number;
}

/**
 * Producto existente que se está editando.
 *
 * Se recibe ya cargado en vez de consultarlo aquí dentro: así el estado se
 * inicializa una sola vez con los valores reales, sin un efecto que copie la
 * respuesta al estado después del primer render.
 */
export interface ProductInitial {
  id: string;
  /** Enum legacy del producto prioritario al que pertenece el SKU */
  productType: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  family: string | null;
  subfamily: string | null;
  observations: string | null;
  pieces: Array<{
    pieceName: string;
    packagingType: "primary" | "secondary" | "tertiary";
    isDomiciliary: boolean;
    materialClass: string;
    wasteType: "recyclable" | "non_recyclable";
    materialDetail: string;
    weightGrams: number;
    weightValue: number | null;
    weightUnit: string;
    repCategoryId: string | null;
    hasGrease: boolean;
    isHazardous: boolean;
    notSubjectToRep: boolean;
    exemptionReason: string | null;
    recycledPercentage: string | null;
    recycledOrigin: string | null;
  }>;
  salesRecords: Array<{
    year: number;
    month: number;
    segment: string;
    unitsSold: number;
  }>;
}

const EMPTY_PIECE: PieceForm = {
  pieceName: "",
  packagingType: "primary",
  isDomiciliary: true,
  materialClass: "Plástico",
  wasteType: "recyclable",
  materialDetail: "",
  weightNative: 0,
  hasGrease: false,
  isHazardous: false,
  notSubjectToRep: false,
  exemptionReason: "",
  recycledPercentage: "",
  recycledOrigin: "",
};

// ── Materiales de envases (D.S. 12/2020) ──
const MATERIAL_CLASSES = ["Plástico", "Metal", "Papel y cartón", "Cartón para líquidos", "Vidrio", "Otros"];
const MATERIAL_DETAILS: Record<string, string[]> = {
  Plástico: [
    "PET",
    "HDPE",
    "PVC",
    "LDPE",
    "PP Rígido",
    "PP Flexible",
    "PS",
    "EPS",
    "Otros Plásticos",
    "Bioplástico compostable",
    "Bioplástico no compostable",
  ],
  Metal: ["Aluminio (Latas)", "Hojalata", "Otros envases de metal", "Metal con aire comprimido"],
  "Papel y cartón": ["Cartón", "Papel", "Otro Papel Compuesto"],
  "Cartón para líquidos": ["Cartón para líquidos"],
  Vidrio: ["Vidrio transparente", "Vidrio color"],
  Otros: ["Madera", "Textil", "Cerámica", "Otros"],
};

/** Configuración de terminología por producto prioritario */
const PP_CONFIG: Record<
  string,
  { pieceSection: string; pieceName: string; salesLabel: string }
> = {
  envases_embalajes: { pieceSection: "Piezas del Envase", pieceName: "Botella, Tapa, Etiqueta...", salesLabel: "Unidades vendidas" },
  neumaticos: { pieceSection: "Especificación del Neumático", pieceName: "Unidad", salesLabel: "Unidades comercializadas" },
  raee: { pieceSection: "Especificación del Aparato", pieceName: "Unidad", salesLabel: "Unidades comercializadas" },
  aceites_lubricantes: { pieceSection: "Especificación del Aceite", pieceName: "Presentación", salesLabel: "Litros comercializados" },
  pilas_aee: { pieceSection: "Especificación del Producto", pieceName: "Unidad", salesLabel: "Unidades comercializadas" },
};

/**
 * Enum legacy `products.product_type` → código del catálogo.
 *
 * Solo difieren en pilas; el resto coincide. Es la inversa del mapa que usa el
 * servidor al resolver el producto prioritario.
 */
const PRODUCT_TYPE_TO_CODE: Record<string, string> = { pilas: "pilas_aee" };

/** Pieza guardada → estado del formulario */
function toPieceForm(p: ProductInitial["pieces"][number]): PieceForm {
  return {
    pieceName: p.pieceName,
    packagingType: p.packagingType,
    isDomiciliary: p.isDomiciliary,
    materialClass: p.materialClass,
    wasteType: p.wasteType,
    materialDetail: p.materialDetail,
    // El peso nativo es el que ve el usuario; weightGrams es el derivado
    weightNative: p.weightValue ?? p.weightGrams,
    repCategoryId: p.repCategoryId ?? undefined,
    hasGrease: p.hasGrease,
    isHazardous: p.isHazardous,
    notSubjectToRep: p.notSubjectToRep,
    exemptionReason: p.exemptionReason ?? "",
    recycledPercentage: p.recycledPercentage
      ? String(Number(p.recycledPercentage))
      : "",
    recycledOrigin:
      p.recycledOrigin === "nacional" || p.recycledOrigin === "importado"
        ? p.recycledOrigin
        : "",
  };
}

export function ProductForm({ initial }: { initial?: ProductInitial } = {}) {
  const router = useRouter();
  const { selected } = usePriorityProduct();
  /**
   * Editando manda el producto prioritario DEL SKU, no el del selector lateral.
   *
   * Si se tomara el del selector, abrir un SKU de RAEE con "Envases" activo
   * mostraría el formulario equivocado y, al guardar, lo reclasificaría.
   */
  const ppCode = initial
    ? PRODUCT_TYPE_TO_CODE[initial.productType] ?? initial.productType
    : (selected?.code ?? "envases_embalajes");
  const isEnvases = ppCode === "envases_embalajes";
  const cfg = PP_CONFIG[ppCode] ?? PP_CONFIG.envases_embalajes;
  const isEdit = Boolean(initial);

  // Unidad nativa y categorías legales del producto prioritario
  const { data: ppList } = trpc.priorityProduct.list.useQuery();
  const nativeUnit = ppList?.find((p) => p.code === ppCode)?.nativeUnit ?? "g";
  const { data: repCategories = [] } = trpc.priorityProduct.categories.useQuery(
    { code: ppCode },
    { enabled: !isEnvases }
  );

  const utils = trpc.useUtils();
  const volverAlListado = () => {
    utils.product.list.invalidate();
    router.push("/products");
  };
  const createMutation = trpc.product.create.useMutation({
    onSuccess: volverAlListado,
  });
  const updateMutation = trpc.product.update.useMutation({
    onSuccess: volverAlListado,
  });
  const mutation = isEdit ? updateMutation : createMutation;

  const [sku, setSku] = useState(initial?.sku ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [family, setFamily] = useState(initial?.family ?? "");
  const [subfamily, setSubfamily] = useState(initial?.subfamily ?? "");
  const [observations, setObservations] = useState(initial?.observations ?? "");
  const [unitsSold, setUnitsSold] = useState<number | undefined>();
  const [salesYear, setSalesYear] = useState(2026);
  /**
   * Ventas ya declaradas. Solo en edición: son las que el importador cargó por
   * mes y segmento, y hay que reenviarlas tal cual o dejarlas intactas. Guardar
   * aquí un total anual además de los meses haría que ese SKU aporte su
   * tonelaje dos veces, porque el cálculo suma todos los períodos.
   */
  const [sales, setSales] = useState<SaleForm[]>(
    (initial?.salesRecords ?? []).map((s) => ({
      year: s.year,
      month: s.month,
      segment:
        s.segment === "No Domiciliario" ? "No Domiciliario" : "Domiciliario",
      unitsSold: s.unitsSold,
    }))
  );
  const [pieces, setPieces] = useState<PieceForm[]>(
    initial
      ? initial.pieces.map(toPieceForm)
      : [{ ...EMPTY_PIECE, pieceName: isEnvases ? "" : "Unidad" }]
  );

  function addPiece() {
    setPieces([...pieces, { ...EMPTY_PIECE, pieceName: isEnvases ? "" : "Unidad" }]);
  }

  function removePiece(index: number) {
    setPieces(pieces.filter((_, i) => i !== index));
  }

  function updatePiece(index: number, updates: Partial<PieceForm>) {
    setPieces(
      pieces.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  }

  /** Etiqueta corta de material según producto (misma regla del seed) */
  function materialFor(piece: PieceForm): { materialClass: string; materialDetail: string } {
    if (isEnvases)
      return { materialClass: piece.materialClass, materialDetail: piece.materialDetail };
    const cat = repCategories.find((c) => c.id === piece.repCategoryId);
    const shortCode = (cat?.code ?? "").split("—")[0].trim();
    const materialClass =
      ppCode === "neumaticos" ? `Cat. ${shortCode}`
      : ppCode === "aceites_lubricantes" ? "Aceite Lubricante"
      : shortCode || "Otros";
    return {
      materialClass,
      materialDetail: cat?.subcategory || shortCode || materialClass,
    };
  }

  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEnvases && pieces.some((p) => !p.repCategoryId)) {
      setFormError("Selecciona la Categoría REP del producto.");
      return;
    }
    if (pieces.length === 0) {
      setFormError("El producto necesita al menos una pieza.");
      return;
    }
    setFormError(null);

    const data = {
      sku,
      name,
      brand: brand || undefined,
      category: category || undefined,
      family: family || undefined,
      subfamily: subfamily || undefined,
      observations: observations || undefined,
      priorityProductCode: ppCode,
      pieces: pieces.map((p) => ({
        pieceName: isEnvases ? p.pieceName : p.pieceName || "Unidad",
        packagingType: p.packagingType,
        isDomiciliary: isEnvases ? p.isDomiciliary : false,
        wasteType: p.wasteType,
        ...materialFor(p),
        // weightGrams siempre en gramos; el valor nativo va aparte
        weightGrams: nativeUnit === "g" ? p.weightNative : p.weightNative * 1000,
        weightValue: p.weightNative,
        weightUnit: nativeUnit,
        repCategoryId: p.repCategoryId,
        hasGrease: isEnvases ? p.hasGrease : false,
        isHazardous: p.isHazardous,
        notSubjectToRep: p.notSubjectToRep,
        exemptionReason: p.exemptionReason || undefined,
        hasRecycledMaterial: Number(p.recycledPercentage) > 0,
        recycledPercentage: p.recycledPercentage
          ? Number(p.recycledPercentage)
          : undefined,
        recycledOrigin: p.recycledOrigin || undefined,
      })),
      /**
       * En edición se reenvían los períodos ya declarados (el servidor hace
       * upsert por año/mes/segmento) y NUNCA el total anual: agregar un
       * registro de mes 0 sobre doce mensuales haría que el SKU aporte su
       * tonelaje dos veces, porque el cálculo suma todos los períodos.
       */
      ...(isEdit
        ? { sales }
        : { unitsSold, salesYear: unitsSold ? salesYear : undefined }),
    };

    if (initial) updateMutation.mutate({ id: initial.id, data });
    else createMutation.mutate(data);
  }

  const totalWeight = pieces.reduce((a, p) => a + (p.weightNative || 0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/products">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isEdit ? `Editar ${initial!.sku}` : "Nuevo Producto"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {selected
                ? `${selected.name} · ${selected.decree ?? ""}`
                : "Registra un SKU con sus piezas y materiales"}
            </p>
          </div>
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          <SaveIcon className="mr-2 h-4 w-4" />
          {mutation.isPending
            ? "Guardando..."
            : isEdit
              ? "Guardar cambios"
              : "Guardar Producto"}
        </Button>
      </div>

      {isEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p>
            Al guardar se reemplazan <strong>todas</strong> las piezas por las
            que aparecen abajo. Quitar una de la lista la elimina del SKU.
          </p>
          <p className="text-muted-foreground mt-1">
            El cambio queda registrado con tu usuario y la fecha.
          </p>
        </div>
      )}

      {(formError || mutation.error) && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {formError ?? mutation.error?.message}
        </div>
      )}

      {/* Product Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageIcon className="h-5 w-5 text-primary" />
            Información del Producto
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">SKU *</Label>
            <Input
              id="sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder={isEnvases ? "Ej: ENV-001" : "Ej: SKU-001"}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del producto *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isEnvases ? "Ej: Botella PET 1,5L" : "Ej: Nombre / modelo"
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand">Marca / Productor</Label>
            <Input
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ej: Marca"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Categoría interna</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ej: Bebidas, Automotriz..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="family">Familia</Label>
            <Input
              id="family"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="Ej: Lácteos"
            />
            <p className="text-xs text-muted-foreground">
              Para agrupar el catálogo. Si la dejas vacía se agrupa por la
              categoría interna.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subfamily">Subfamilia</Label>
            <Input
              id="subfamily"
              value={subfamily}
              onChange={(e) => setSubfamily(e.target.value)}
              placeholder="Ej: Yogurts"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="obs">Observaciones</Label>
            <Textarea
              id="obs"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Puesta en Mercado</CardTitle>
          <CardDescription>
            {isEdit
              ? "Períodos ya declarados. Se editan las unidades; el período no cambia."
              : `Opcional — ${cfg.salesLabel.toLowerCase()} en un año`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEdit ? (
            sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este SKU no tiene ventas declaradas. Se cargan desde la
                importación de la línea base.
              </p>
            ) : (
              <div className="space-y-2">
                {sales.map((s, i) => (
                  <div
                    key={`${s.year}-${s.month}-${s.segment}`}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-2"
                  >
                    <span className="min-w-32 text-sm">
                      {s.month === 0 ? s.year : `${MONTH_NAMES[s.month]} ${s.year}`}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {s.segment === "Domiciliario" ? "DOM" : "NO DOM"}
                    </Badge>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-40 text-sm"
                      value={s.unitsSold}
                      onChange={(e) =>
                        setSales(
                          sales.map((x, j) =>
                            j === i
                              ? { ...x, unitsSold: Number(e.target.value) || 0 }
                              : x
                          )
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {cfg.salesLabel.toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="salesYear">Año</Label>
                <Select
                  value={String(salesYear)}
                  onValueChange={(v) => setSalesYear(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="units">{cfg.salesLabel}</Label>
                <Input
                  id="units"
                  type="number"
                  min={0}
                  value={unitsSold ?? ""}
                  onChange={(e) =>
                    setUnitsSold(
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  placeholder="Ej: 100000"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pieces / Especificación */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isEnvases ? (
                  <LayersIcon className="h-5 w-5 text-primary" />
                ) : (
                  <ScaleIcon className="h-5 w-5 text-primary" />
                )}
                {cfg.pieceSection}
                {isEnvases && <Badge variant="secondary">{pieces.length}</Badge>}
              </CardTitle>
              <CardDescription>
                Peso total: {totalWeight.toFixed(1)} {nativeUnit}
              </CardDescription>
            </div>
            {isEnvases && (
              <Button type="button" variant="outline" size="sm" onClick={addPiece}>
                <PlusIcon className="mr-1 h-4 w-4" />
                Agregar Pieza
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pieces.map((piece, idx) => (
            <div
              key={idx}
              className="rounded-lg border bg-card p-4 space-y-4"
            >
              {isEnvases && (
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">
                    Pieza {idx + 1}
                    {piece.pieceName && ` — ${piece.pieceName}`}
                  </h4>
                  {pieces.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removePiece(idx)}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}

              {isEnvases ? (
                <>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nombre *</Label>
                      <Input
                        value={piece.pieceName}
                        onChange={(e) =>
                          updatePiece(idx, { pieceName: e.target.value })
                        }
                        placeholder={cfg.pieceName}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo Envase</Label>
                      <Select
                        value={piece.packagingType}
                        onValueChange={(v) =>
                          updatePiece(idx, {
                            packagingType: v as PieceForm["packagingType"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="primary">Primario</SelectItem>
                          <SelectItem value="secondary">Secundario</SelectItem>
                          <SelectItem value="tertiary">Terciario</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Peso (g) *</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={piece.weightNative || ""}
                        onChange={(e) =>
                          updatePiece(idx, {
                            weightNative: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="25.5"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Material *</Label>
                      <Select
                        value={piece.materialClass}
                        onValueChange={(v) =>
                          updatePiece(idx, {
                            materialClass: v,
                            materialDetail: MATERIAL_DETAILS[v]?.[0] || "",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATERIAL_CLASSES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Detalle Material *</Label>
                      <Select
                        value={piece.materialDetail}
                        onValueChange={(v) =>
                          updatePiece(idx, { materialDetail: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            MATERIAL_DETAILS[piece.materialClass] || ["Otros"]
                          ).map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo Residuo</Label>
                      <Select
                        value={piece.wasteType}
                        onValueChange={(v) =>
                          updatePiece(idx, {
                            wasteType: v as "recyclable" | "non_recyclable",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="recyclable">Reciclable</SelectItem>
                          <SelectItem value="non_recyclable">
                            No Reciclable
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={piece.isDomiciliary}
                        onCheckedChange={(v) =>
                          updatePiece(idx, { isDomiciliary: v })
                        }
                      />
                      <Label className="text-xs font-normal">Domiciliario</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={piece.hasGrease}
                        onCheckedChange={(v) =>
                          updatePiece(idx, { hasGrease: v })
                        }
                      />
                      <Label className="text-xs font-normal">
                        Presencia de grasa
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={piece.isHazardous}
                        onCheckedChange={(v) =>
                          updatePiece(idx, { isHazardous: v })
                        }
                      />
                      <Label className="text-xs font-normal">Peligroso</Label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Formulario para neumáticos / RAEE / aceites / pilas */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Categoría REP ({selected?.decree}) *</Label>
                      <Select
                        value={piece.repCategoryId ?? ""}
                        onValueChange={(v) =>
                          updatePiece(idx, { repCategoryId: v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría legal..." />
                        </SelectTrigger>
                        <SelectContent>
                          {repCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="font-medium">{c.code}</span>
                              {c.subcategory && (
                                <span className="ml-1 text-muted-foreground">
                                  · {c.subcategory}
                                </span>
                              )}
                              {!c.subjectToRep && (
                                <span className="ml-1 text-amber-600">
                                  (exento REP)
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Peso neto unitario ({nativeUnit}) *
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={piece.weightNative || ""}
                        onChange={(e) =>
                          updatePiece(idx, {
                            weightNative: Number(e.target.value) || 0,
                          })
                        }
                        placeholder={nativeUnit === "L" ? "Ej: 1 (presentación)" : "Ej: 58"}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={piece.isHazardous}
                        onCheckedChange={(v) =>
                          updatePiece(idx, { isHazardous: v })
                        }
                      />
                      <Label className="text-xs font-normal">Peligroso</Label>
                    </div>
                  </div>
                </>
              )}

              {/* ── Régimen REP y material reciclado (todos los productos) ── */}
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={piece.notSubjectToRep}
                    onCheckedChange={(v) =>
                      updatePiece(idx, {
                        notSubjectToRep: v,
                        exemptionReason: v ? piece.exemptionReason : "",
                      })
                    }
                  />
                  <Label className="text-xs font-normal">
                    No afecto a REP
                  </Label>
                  {piece.notSubjectToRep && (
                    <Input
                      className="h-8 max-w-xs text-xs"
                      value={piece.exemptionReason}
                      onChange={(e) =>
                        updatePiece(idx, { exemptionReason: e.target.value })
                      }
                      placeholder="Motivo: madera reutilizable, envase retornable..."
                    />
                  )}
                </div>
                {piece.notSubjectToRep && (
                  <p className="text-xs text-muted-foreground">
                    Se declara igual, pero no paga tarifa. Sin esta marca la
                    pieza aparece como &laquo;sin mapear&raquo; en Riesgos,
                    indistinguible de un error de configuración.
                  </p>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Material reciclado (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="h-8 w-28 text-xs"
                      value={piece.recycledPercentage}
                      onChange={(e) =>
                        updatePiece(idx, { recycledPercentage: e.target.value })
                      }
                      placeholder="Ej: 30"
                    />
                  </div>
                  {Number(piece.recycledPercentage) > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Origen</Label>
                      <Select
                        value={piece.recycledOrigin || undefined}
                        onValueChange={(v) =>
                          updatePiece(idx, {
                            recycledOrigin: v as "nacional" | "importado",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nacional">Nacional</SelectItem>
                          <SelectItem value="importado">Importado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {Number(piece.recycledPercentage) > 0 &&
                  !piece.recycledOrigin && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Indica el origen: cuando exista el descuento en tarifa
                      solo aplicará al reciclado nacional.
                    </p>
                  )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </form>
  );
}
