"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ProductForm, type ProductInitial } from "../../product-form";
import { Button } from "@/components/ui/button";
import { Loader2Icon, ArrowLeftIcon } from "lucide-react";

/**
 * Edición de un SKU existente.
 *
 * El formulario se monta recién cuando el producto está cargado, y con `key`
 * en el id: así inicializa su estado una sola vez con los valores reales, sin
 * un efecto que copie la respuesta al estado después del primer render.
 */
export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = trpc.product.getById.useQuery({
    id: params.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 py-8">
        <p className="text-destructive">
          {error?.message ?? "Producto no encontrado."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/products">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Volver a Productos
          </Link>
        </Button>
      </div>
    );
  }

  return <ProductForm key={data.id} initial={data as ProductInitial} />;
}
