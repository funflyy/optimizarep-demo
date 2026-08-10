"use client";

import { trpc } from "@/lib/trpc";
import { useProductType } from "@/hooks/use-product-type";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GaugeIcon, InfoIcon, Loader2Icon } from "lucide-react";

const num = (n: number, d = 1) =>
  n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });

const NIVELES = [
  { nivel: "Excelente", rango: "80–100", color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { nivel: "Bueno", rango: "60–79", color: "bg-lime-500", text: "text-lime-600 dark:text-lime-400" },
  { nivel: "Mejorable", rango: "40–59", color: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { nivel: "Crítico", rango: "0–39", color: "bg-red-500", text: "text-red-600 dark:text-red-400" },
] as const;

const estilo = (nivel: string) =>
  NIVELES.find((n) => n.nivel === nivel) ?? NIVELES[3];

export default function CircularityPage() {
  const productType = useProductType();
  const { data, isLoading } = trpc.circularity.byProduct.useQuery({
    productType: productType ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = data?.items.length ?? 0;
  const sinDatos = data?.porDimension.filter((d) => d.promedio === null) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Índice de Circularidad
        </h1>
        <p className="text-muted-foreground mt-1">
          Indicador propio de la plataforma, de 0 a 100 puntos por SKU
        </p>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin SKU con piezas declaradas para evaluar.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Índice general ── */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Índice promedio del catálogo</CardDescription>
                <CardTitle
                  className={`text-4xl ${estilo(data!.nivelPromedio).text}`}
                >
                  {num(data!.promedio)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">{data!.nivelPromedio}</Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {total} SKU evaluados
                  {data!.sinPiezas > 0 &&
                    ` · ${data!.sinPiezas} sin piezas declaradas`}
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardDescription>Distribución</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {NIVELES.map((n) => {
                  const cuenta = data!.niveles[n.nivel] ?? 0;
                  const pct = total > 0 ? (cuenta / total) * 100 : 0;
                  return (
                    <div key={n.nivel} className="flex items-center gap-3">
                      <span className="w-24 text-sm">{n.nivel}</span>
                      <span className="w-16 text-xs text-muted-foreground">
                        {n.rango}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className={`h-full ${n.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm tabular-nums">
                        {cuenta} SKU
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* ── Dimensiones ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GaugeIcon className="h-5 w-5 text-muted-foreground" />
                Dimensiones
              </CardTitle>
              <CardDescription>
                Los pesos son los definidos por MB. El promedio es sobre los SKU
                donde la dimensión se pudo evaluar.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dimensión</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead className="text-right">Promedio</TableHead>
                    <TableHead className="text-right">Evaluados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.porDimension.map((d) => (
                    <TableRow key={d.key}>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(d.weight * 100)}%
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {d.promedio === null ? (
                          <span className="text-muted-foreground font-normal">
                            sin datos
                          </span>
                        ) : (
                          num(d.promedio)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {d.evaluados} / {total}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sinDatos.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {sinDatos.map((d) => d.label).join(", ")} no se puede evaluar
                  todavía: su peso se reparte entre las demás. No se puntúa cero
                  — no tener el dato no es lo mismo que tenerlo en cero.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Ranking ── */}
          <Card>
            <CardHeader>
              <CardTitle>SKU por índice</CardTitle>
              <CardDescription>
                De menor a mayor. La dimensión más débil es por dónde conviene
                empezar.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Índice</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Envase</TableHead>
                    <TableHead>Dimensión más débil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.items.map((i) => {
                    const e = estilo(i.level);
                    return (
                      <TableRow key={i.id}>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${e.text}`}
                        >
                          {num(i.score)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${e.color}`} />
                            <span className="text-sm">{i.level}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {i.sku}
                        </TableCell>
                        <TableCell className="text-sm">{i.name}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {num(i.totalWeightGrams)} g
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {i.weakest && (
                            <>
                              <span className="font-medium">
                                {i.weakest.label}
                              </span>{" "}
                              ({num(i.weakest.score ?? 0)}) — {i.weakest.detail}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── Metodología ── */}
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <InfoIcon className="mt-0.5 h-6 w-6 shrink-0 text-blue-500" />
                <div className="space-y-2">
                  <p className="font-semibold">
                    Metodología — propuesta para revisar
                  </p>
                  <p className="text-sm text-muted-foreground">
                    La escala, los tramos y los pesos son los que definió MB. Lo
                    que sigue es cómo se puntúa cada dimensión; está escrito para
                    que puedan discutirse una por una.
                  </p>
                  <ul className="list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
                    <li>
                      <strong>Materiales y componentes</strong>: 100 puntos si es
                      monomaterial de una pieza, y cada material o pieza extra
                      descuenta (25 y 20 puntos). Cada uno es una separación más
                      que alguien tiene que hacer para que el envase se recicle.
                    </li>
                    <li>
                      <strong>Reciclabilidad</strong>: porcentaje de la masa que
                      es reciclable, no de las piezas. Una etiqueta no reciclable
                      de 0,2 g no puede pesar lo mismo que una botella de 30 g.
                      Una pieza reciclable con grasa cuenta la mitad, porque los
                      SIG ya cobran esa categoría más caro por la contaminación.
                    </li>
                    <li>
                      <strong>Material reciclado</strong>: el puntaje es
                      directamente el porcentaje incorporado, ponderado por masa.
                      Es exigente a propósito. El origen no entra acá: decidirá
                      el descuento en la tarifa, que es un efecto económico.
                    </li>
                    <li>
                      <strong>Peso</strong>: contra la mediana de los envases de
                      la misma familia. Pesar como el resto vale 50 puntos, la
                      mitad vale 75 y el doble vale 0.
                    </li>
                    <li>
                      <strong>Alcance</strong>: se mide el envase del producto
                      (primario y secundario). El embalaje de transporte queda
                      fuera: solo una parte de los SKU lo declara, así que
                      incluirlo penalizaría a quien declara mejor.
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
