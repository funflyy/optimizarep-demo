import { db } from "@/server/db";
import {
  managementSystems,
  tariffCategories,
  productPieces,
  products,
} from "@/server/db/schema";
import { sql, eq } from "drizzle-orm";
import { getActivePriorityProduct } from "@/lib/priority-product-server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LinkIcon, ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MappingMatrix } from "./mapping-matrix";

export default async function TariffMappingsPage() {
  const pp = await getActivePriorityProduct();

  // Materiales únicos del catálogo (vista global pre-multi-tenancy),
  // acotados al producto prioritario activo del sidebar
  const materials = await db
    .select({
      materialClass: productPieces.materialClass,
      materialDetail: productPieces.materialDetail,
      isDomiciliary: productPieces.isDomiciliary,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(productPieces)
    .innerJoin(products, eq(productPieces.productId, products.id))
    .where(pp ? eq(products.priorityProductId, pp.id) : undefined)
    .groupBy(
      productPieces.materialClass,
      productPieces.materialDetail,
      productPieces.isDomiciliary
    )
    .orderBy(productPieces.materialClass, productPieces.materialDetail);

  // SIGs activos del producto prioritario, con sus categorías
  const systems = await db.query.managementSystems.findMany({
    where: (s, { eq, and }) =>
      and(
        eq(s.isActive, true),
        pp ? eq(s.priorityProductId, pp.id) : undefined
      ),
    with: {
      tariffCategories: {
        orderBy: (tc, { asc }) => [asc(tc.subcategory)],
      },
    },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tariffs">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Mapeo de Materiales
          </h1>
          <p className="text-muted-foreground mt-1">
            Asigna cada material de tu catálogo a la categoría de tarifa
            correspondiente en cada Sistema de Gestión
          </p>
        </div>
      </div>

      {/* Mapping Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Matriz Material → Categoría de Tarifa
          </CardTitle>
          <CardDescription>
            {materials.length} combinaciones de material encontradas en tu
            catálogo de productos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MappingMatrix materials={materials} systems={systems} />
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            💡 <strong>Instrucciones:</strong> El sistema pre-selecciona
            automáticamente la categoría según el nombre del detalle. Si deseas
            personalizarla, selecciona la categoría adecuada en el menú. Tus
            cambios manuales se guardarán inmediatamente en la base de datos y
            afectarán directamente el cálculo de costos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

