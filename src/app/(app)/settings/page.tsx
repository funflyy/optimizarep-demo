import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsIcon, BuildingIcon, UsersIcon } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-1">
          Administración de organización y usuarios
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BuildingIcon className="h-5 w-5 text-primary" />
              Organización
            </CardTitle>
            <CardDescription>
              Razón social, RUT, campos personalizados y configuración general
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Configuración disponible cuando Clerk esté activado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-primary" />
              Usuarios
            </CardTitle>
            <CardDescription>
              Gestión de usuarios, roles (Admin, Analista, Visor) e
              invitaciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gestión de usuarios disponible cuando Clerk esté activado
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
