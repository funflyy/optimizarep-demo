"use client";

import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { PriorityProductSidebarSwitcher } from "@/components/priority-product-sidebar-switcher";
import { SidebarUf } from "@/components/sidebar-uf";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  LayoutDashboardIcon,
  DollarSignIcon,
  SettingsIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  LightbulbIcon,
} from "lucide-react";
import Image from "next/image";

const navMain = [
  {
    title: "Resumen Ejecutivo",
    url: "/dashboard",
    icon: (<LayoutDashboardIcon />),
  },
  {
    title: "Costos REP",
    url: "/costs",
    icon: (<DollarSignIcon />),
  },
  {
    title: "Riesgos",
    url: "/risks",
    icon: (<ShieldAlertIcon />),
  },
  {
    title: "Simulador",
    url: "/simulator",
    icon: (<SlidersHorizontalIcon />),
  },
  {
    title: "Oportunidades",
    url: "/opportunities",
    icon: (<LightbulbIcon />),
  },
  {
    title: "Configuración",
    url: "/settings",
    icon: (<SettingsIcon />),
    items: [
      { title: "Productos (SKUs)", url: "/products" },
      { title: "Importar Excel", url: "/products/import" },
      { title: "Tarifas por SIG", url: "/tariffs" },
      { title: "Mapeo de Materiales", url: "/tariffs/mappings" },
      { title: "Sistemas de Gestión", url: "/tariffs/systems" },
      { title: "Reportes / Exportar", url: "/reports" },
       { title: "Organización", url: "/settings" },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                <Image src="/ImpactaREP.svg" alt="ImpactaREP" width={32} height={32} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">ImpactaREP</span>
                <span className="truncate text-xs text-muted-foreground">
                  Mide · Gestiona · Impacta
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <PriorityProductSidebarSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUf />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

