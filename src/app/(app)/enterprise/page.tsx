"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function EnterprisePage() {
  const orgsQ = trpc.enterprise.listMyOrgs.useQuery();
  const usersQ = trpc.enterprise.listUsers.useQuery();

  if (orgsQ.error) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-semibold">Acceso denegado</h1>
        <p className="text-muted-foreground mt-2">
          {orgsQ.error.message ?? "Se requiere admin de enterprise"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mi Enterprise</h1>
        <p className="text-muted-foreground text-sm">
          Organizaciones y usuarios de MB
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Organizaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {orgsQ.data?.length ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {usersQ.data?.length ?? "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organizaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            {orgsQ.data?.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between border-b py-1.5"
              >
                <span>{o.name}</span>
                <span className="text-muted-foreground">{o.rut ?? "—"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            {usersQ.data?.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between border-b pb-2"
              >
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {u.firstName} {u.lastName}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary">{u.role}</Badge>
                  {!u.isActive && <Badge variant="destructive">inactivo</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
