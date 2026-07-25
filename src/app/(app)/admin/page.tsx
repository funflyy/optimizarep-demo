"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  const enterprisesQ = trpc.superadmin.listEnterprises.useQuery();
  const orgsQ = trpc.superadmin.listOrgs.useQuery();
  const usersQ = trpc.superadmin.listUsers.useQuery();

  if (enterprisesQ.error) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-semibold">Acceso denegado</h1>
        <p className="text-muted-foreground mt-2">
          {enterprisesQ.error.message ?? "Se requiere superadmin"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plataforma</h1>
        <p className="text-muted-foreground text-sm">
          Vista superadmin — todas las enterprises y orgs
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Enterprises</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {enterprisesQ.data?.length ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Organizaciones</CardTitle>
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
          <CardTitle>Enterprises</CardTitle>
        </CardHeader>
        <CardContent>
          {enterprisesQ.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin enterprises</p>
          ) : (
            <ul className="space-y-2">
              {enterprisesQ.data?.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between border-b pb-2"
                >
                  <span className="font-medium">{e.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {e.rut ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            {orgsQ.data?.slice(0, 20).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between border-b py-1.5"
              >
                <span>{o.name}</span>
                <span className="text-muted-foreground">{o.rut ?? "—"}</span>
              </div>
            ))}
            {orgsQ.data && orgsQ.data.length > 20 && (
              <p className="text-xs text-muted-foreground mt-2">
                Mostrando 20 de {orgsQ.data.length}
              </p>
            )}
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
                  {u.isSuperAdmin && (
                    <Badge className="bg-purple-600">superadmin</Badge>
                  )}
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
