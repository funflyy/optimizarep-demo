"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
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
import { Button } from "@/components/ui/button";
import { PackageIcon, PlusIcon, Loader2Icon, UploadIcon } from "lucide-react";
import Link from "next/link";
import { ProductRow } from "./product-row";
import { ProductFilters } from "./product-filters";
import { ExcelExportButton } from "@/components/excel-export-button";
import { useProductType } from "@/hooks/use-product-type";

export function ProductList() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const productType = useProductType();

  const { data, isLoading } = trpc.product.list.useQuery({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
    productType: productType ?? undefined,
  });

  const { data: categories = [] } = trpc.product.categories.useQuery();

  const allProducts = data?.products ?? [];

  /**
   * SKU desde los que se puede copiar el envase: los que tienen piezas y no son
   * ellos mismos una réplica, para no encadenar copias de copias.
   */
  const replicaCandidates = allProducts
    .filter(
      (p) => p.pieces.length > 0 && !p.pieces.some((pc) => pc.isReplica)
    )
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      pieceCount: p.pieces.length,
    }));

  const totalPieces = allProducts.reduce(
    (acc, p) => acc + p.pieces.length,
    0
  );
  const withSales = allProducts.filter(
    (p) => p.salesRecords.length > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground mt-1">
            Catálogo de SKUs con sus piezas y materiales declarados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton
            data={allProducts.map((p) => ({
              SKU: p.sku,
              Producto: p.name,
              Marca: p.brand || "",
              Categoría: p.category || "",
              Piezas: p.pieces.length,
              "Peso Total (g)": p.pieces.reduce((a, pc) => a + pc.weightGrams, 0).toFixed(1),
              Ventas: p.salesRecords[0]?.unitsSold ?? "",
            }))}
            filename="productos_optimizarep"
          />
          <Button variant="outline" size="sm" asChild>
            <Link href="/products/import">
              <UploadIcon className="mr-2 h-4 w-4" />
              Importar
            </Link>
          </Button>
          <Button asChild>
            <Link href="/products/new">
              <PlusIcon className="mr-2 h-4 w-4" />
              Agregar Producto
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total SKUs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allProducts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Piezas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPieces}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Con Ventas Registradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {withSales}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {allProducts.length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PackageIcon className="h-5 w-5 text-primary" />
                Listado de Productos
              </CardTitle>
              <CardDescription>
                Haz clic en un producto para ver el desglose de piezas
              </CardDescription>
            </div>
          </div>
          <ProductFilters
            categories={categories}
            search={search}
            category={category}
            onSearchChange={setSearch}
            onCategoryChange={setCategory}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {search || category !== "all"
                ? "No se encontraron productos con esos filtros"
                : "No hay productos registrados. Agrega el primero."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-center">Piezas</TableHead>
                  <TableHead className="text-right">Peso Total (g)</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    candidates={replicaCandidates.filter(
                      (c) => c.id !== product.id
                    )}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
