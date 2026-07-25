import {
  CarFrontIcon,
  PackageIcon,
  MonitorSmartphoneIcon,
  DropletsIcon,
  BatteryChargingIcon,
} from "lucide-react";

/** Ícono por código de producto prioritario */
export const PRIORITY_PRODUCT_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  neumaticos: CarFrontIcon,
  envases_embalajes: PackageIcon,
  raee: MonitorSmartphoneIcon,
  aceites_lubricantes: DropletsIcon,
  pilas_aee: BatteryChargingIcon,
};

export const DEFAULT_PRIORITY_PRODUCT_ICON = PackageIcon;
