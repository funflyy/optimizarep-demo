import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, dashboardCharts } from "@/server/db/schema";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusIcon, PencilIcon } from "lucide-react";

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const u = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);

  if (u.length === 0 && process.env.NODE_ENV !== "production") {
    await db.insert(users).values({
      clerkUserId: userId,
      email: userId,
      role: "admin",
    });
  } else if (u[0]?.role !== "admin") {
    return <p className="p-8 text-muted-foreground">Se requiere rol admin.</p>;
  }

  const charts = await db
    .select()
    .from(dashboardCharts)
    .orderBy(dashboardCharts.position);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Widgets configurables
          </h1>
          <p className="text-muted-foreground mt-1">
            Crea gráficos personalizados que verán las empresas seleccionadas.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/admin/new">
            <PlusIcon className="mr-2 h-4 w-4" /> Nuevo widget
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {charts.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-muted-foreground">
              Aún no hay widgets. Crea el primero.
            </CardContent>
          </Card>
        )}
        {charts.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription>
                {c.chartType.toUpperCase()} · {c.aggregation.toUpperCase()} de{" "}
                {c.metric}
                {c.dimension ? ` por ${c.dimension}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/admin/${c.id}/edit`}>
                  <PencilIcon className="mr-1 h-3 w-3" /> Editar
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
