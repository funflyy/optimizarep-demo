"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import {
  usePriorityProduct,
  type SelectedPriorityProduct,
} from "@/components/priority-product-context";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2Icon, CheckIcon } from "lucide-react";
import {
  PRIORITY_PRODUCT_ICONS,
  DEFAULT_PRIORITY_PRODUCT_ICON,
} from "@/components/priority-product-icons";

export default function SelectProductPage() {
  const router = useRouter();
  const { selected, select } = usePriorityProduct();
  const { data: products, isLoading } = trpc.priorityProduct.list.useQuery();

  function handleSelect(pp: SelectedPriorityProduct) {
    select(pp);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          ¿Qué Producto Prioritario quieres gestionar?
        </h1>
        <p className="text-muted-foreground mt-2">
          Cada producto prioritario tiene sistemas de gestión, tarifas y metas
          propias — la información no se mezcla entre ellos.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products?.map((pp) => {
            const Icon =
              PRIORITY_PRODUCT_ICONS[pp.code] ?? DEFAULT_PRIORITY_PRODUCT_ICON;
            const isCurrent = selected?.id === pp.id;
            return (
              <Card
                key={pp.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  handleSelect({
                    id: pp.id,
                    code: pp.code,
                    name: pp.name,
                    decree: pp.decree,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    handleSelect({
                      id: pp.id,
                      code: pp.code,
                      name: pp.name,
                      decree: pp.decree,
                    });
                }}
                className={`cursor-pointer transition-all hover:border-primary hover:shadow-md ${
                  isCurrent ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    {isCurrent && (
                      <Badge className="gap-1">
                        <CheckIcon className="h-3 w-3" /> Actual
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="mt-2 text-base">{pp.name}</CardTitle>
                  <CardDescription>
                    {pp.decree}
                    {pp.goalsEffectiveFrom
                      ? ` · metas desde ${pp.goalsEffectiveFrom}`
                      : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Podrás cambiar de producto prioritario en cualquier momento desde la
        barra superior.
      </p>
    </div>
  );
}
