"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { usePriorityProduct } from "@/components/priority-product-context";
import {
  PRIORITY_PRODUCT_ICONS,
  DEFAULT_PRIORITY_PRODUCT_ICON,
} from "@/components/priority-product-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon } from "lucide-react";

/**
 * Selector de Producto Prioritario en el sidebar (acuerdo reunión 11-jul:
 * pantalla intermedia al entrar + cambio de contexto siempre visible).
 * También actúa como guardia: sin selección, redirige a /select-product.
 */
export function PriorityProductSidebarSwitcher() {
  const { selected, loading, select } = usePriorityProduct();
  const { data: products } = trpc.priorityProduct.list.useQuery();
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !selected && pathname !== "/select-product") {
      router.replace("/select-product");
    }
  }, [loading, selected, pathname, router]);

  const Icon = selected
    ? (PRIORITY_PRODUCT_ICONS[selected.code] ?? DEFAULT_PRIORITY_PRODUCT_ICON)
    : LayoutGridIcon;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="border border-sidebar-border bg-sidebar-accent/50 data-[state=open]:bg-sidebar-accent"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Icon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                  Producto Prioritario
                </span>
                <span className="truncate font-semibold">
                  {selected ? selected.name : "Seleccionar…"}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Cambiar producto prioritario
            </DropdownMenuLabel>
            {products?.map((pp) => {
              const ItemIcon =
                PRIORITY_PRODUCT_ICONS[pp.code] ?? DEFAULT_PRIORITY_PRODUCT_ICON;
              const isCurrent = selected?.id === pp.id;
              return (
                <DropdownMenuItem
                  key={pp.id}
                  className="gap-2 py-2"
                  onClick={() => {
                    select({
                      id: pp.id,
                      code: pp.code,
                      name: pp.name,
                      decree: pp.decree,
                    });
                    router.push("/dashboard");
                  }}
                >
                  <div className="flex size-7 items-center justify-center rounded-md border">
                    <ItemIcon className="size-4 shrink-0" />
                  </div>
                  <div className="grid flex-1 leading-tight">
                    <span className="truncate text-sm">{pp.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {pp.decree}
                    </span>
                  </div>
                  {isCurrent && <CheckIcon className="size-4 text-primary" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onClick={() => router.push("/select-product")}
            >
              <LayoutGridIcon className="size-4" />
              Ver pantalla de selección
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
