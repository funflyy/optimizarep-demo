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
  BuildingIcon,
  Building2Icon,
} from "lucide-react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const meQ = trpc.auth.me.useQuery(undefined, { retry: false });

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
        { title: "Widgets Dashboard", url: "/dashboard/admin" },
        { title: "Organización", url: "/settings" },
      ],
    },
  ];

  // Links condicionales según rol
  const adminLinks: Array<{ title: string; url: string; icon: React.ReactNode }> = [];
  if (meQ.data?.isSuperAdmin) {
    adminLinks.push({
      title: "Plataforma (superadmin)",
      url: "/admin",
      icon: (<Building2Icon />),
    });
  }
  if (
    meQ.data?.isSuperAdmin ||
    meQ.data?.role === "enterprise_admin"
  ) {
    adminLinks.push({
      title: "Mi Enterprise",
      url: "/enterprise",
      icon: (<BuildingIcon />),
    });
  }

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
                <Image src="/OptimizaREP-icono.svg" alt="OptimizaREP" width={32} height={32} className="dark:hidden" />
                <Image src="/OptimizaREP-icono-blanco.svg" alt="OptimizaREP" width={32} height={32} className="hidden dark:block" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">OptimizaREP</span>
                <span className="truncate text-xs text-muted-foreground">
                  Inteligencia para gestión REP
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <PriorityProductSidebarSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        {adminLinks.length > 0 && <NavMain items={adminLinks} />}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUf />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

