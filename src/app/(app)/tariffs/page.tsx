import { db } from "@/server/db";
import { managementSystems, tariffCategories, tariffs } from "@/server/db/schema";
import { eq, count, sql } from "drizzle-orm";
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
import { DollarSignIcon, ExternalLinkIcon } from "lucide-react";
import { getActivePriorityProduct } from "@/lib/priority-product-server";

export default async function TariffsPage() {
  const pp = await getActivePriorityProduct();
  const systems = await db.query.managementSystems.findMany({
    where: (s, { eq, and }) =>
      and(
        eq(s.isActive, true),
        pp ? eq(s.priorityProductId, pp.id) : undefined
      ),
    with: {
      tariffCategories: {
        with: {
          tariffs: true,
        },
        orderBy: (tc, { asc }) => [asc(tc.segment), asc(tc.material), asc(tc.subcategory)],
      },
    },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarifas</h1>
        <p className="text-muted-foreground mt-1">
          Tarifas vigentes por Sistema de Gestión Colectivo (UF/Ton)
        </p>
      </div>

      {/* Tabs por Sistema de Gestión */}
      <Tabs defaultValue={systems[0]?.name || ""}>
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
          // Agrupar por segmento
          const bySegment = sys.tariffCategories.reduce(
            (acc, tc) => {
              if (!acc[tc.segment]) acc[tc.segment] = [];
              acc[tc.segment].push(tc);
              return acc;
            },
            {} as Record<string, typeof sys.tariffCategories>
          );

          return (
            <TabsContent key={sys.id} value={sys.name} className="space-y-4">
              {/* System Info */}
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
                  </div>
                </CardHeader>
              </Card>

              {/* Tarifas por Segmento */}
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
                          <TableHead className="text-right">
                            Tarifa 2026
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categories.map((tc) => {
                          const currentTariff = tc.tariffs.find(
                            (t) => t.year === 2026
                          );
                          return (
                            <TableRow key={tc.id}>
                              <TableCell className="font-medium">
                                {tc.material}
                              </TableCell>
                              <TableCell>{tc.subcategory}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {tc.tariffType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold">
                                {currentTariff
                                  ? `${Number(
                                      currentTariff.rateValue ??
                                        currentTariff.rateUfPerTon
                                    ).toLocaleString("es-CL", {
                                      minimumFractionDigits:
                                        currentTariff.rateUnit === "CLP/kg" ? 1 : 2,
                                      maximumFractionDigits:
                                        currentTariff.rateUnit === "CLP/kg" ? 1 : 2,
                                    })} ${currentTariff.rateUnit}${
                                      currentTariff.plusIva ? " +IVA" : ""
                                    }`
                                  : "—"}
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
    </div>
  );
}
