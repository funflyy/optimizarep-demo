import { db } from "@/server/db";
import { managementSystems, tariffCategories, tariffs } from "@/server/db/schema";
import { count, eq } from "drizzle-orm";
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
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, BuildingIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { getActivePriorityProduct } from "@/lib/priority-product-server";

export default async function SystemsPage() {
  const pp = await getActivePriorityProduct();
  const systems = await db.query.managementSystems.findMany({
    where: pp ? (s, { eq }) => eq(s.priorityProductId, pp.id) : undefined,
    with: {
      tariffCategories: {
        with: { tariffs: true },
      },
    },
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tariffs">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Sistemas de Gestión
          </h1>
          <p className="text-muted-foreground mt-1">
            Catálogo de Sistemas de Gestión Colectivos (SIG) registrados
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {systems.map((sys) => {
          const totalCategories = sys.tariffCategories.length;
          const totalTariffs = sys.tariffCategories.reduce(
            (acc, tc) => acc + tc.tariffs.length,
            0
          );
          const segments = new Set(
            sys.tariffCategories.map((tc) => tc.segment)
          );

          return (
            <Card key={sys.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <BuildingIcon className="h-5 w-5 text-primary" />
                    {sys.name}
                  </CardTitle>
                  <Badge
                    variant={sys.isActive ? "default" : "secondary"}
                    className={
                      sys.isActive
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                        : ""
                    }
                  >
                    {sys.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <CardDescription>{sys.priorityProduct}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Categorías</p>
                    <p className="font-semibold">{totalCategories}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tarifas</p>
                    <p className="font-semibold">{totalTariffs}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(segments).map((seg) => (
                    <Badge
                      key={seg}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {seg}
                    </Badge>
                  ))}
                </div>
                {sys.observations && (
                  <p className="text-xs text-muted-foreground">
                    {sys.observations}
                  </p>
                )}
                {sys.tariffUrl && (
                  <a
                    href={sys.tariffUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Ver tarifas oficiales
                    <ExternalLinkIcon className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
