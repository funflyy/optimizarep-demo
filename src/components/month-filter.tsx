"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/**
 * Filtro de período.
 *
 * Las empresas declaran mes a mes y con desfase (1 o 2 meses según DOM o NO
 * DOM), así que hace falta poder mirar un mes puntual además del acumulado.
 *
 * El valor codifica las tres opciones en un string, para que entre en un Select:
 *   ""       → todo el año
 *   "m:3"    → solo marzo
 *   "acc:3"  → acumulado enero a marzo
 */
export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const ALL_MONTHS = "__all__";

/** "m:3" | "acc:3" | ALL_MONTHS → filtros para costs.* */
export function monthFilters(value: string): {
  month?: number;
  monthUpTo?: number;
} {
  if (!value || value === ALL_MONTHS) return {};
  const [kind, raw] = value.split(":");
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 12) return {};
  return kind === "acc" ? { monthUpTo: n } : { month: n };
}

export function monthLabel(value: string): string {
  if (!value || value === ALL_MONTHS) return "Todo el año";
  const [kind, raw] = value.split(":");
  const name = MONTH_NAMES[Number(raw) - 1] ?? raw;
  return kind === "acc" ? `Acumulado a ${name}` : `Solo ${name}`;
}

export function MonthFilter({
  value,
  onChange,
  months,
  label = "Período",
}: {
  value: string;
  onChange: (v: string) => void;
  /** Meses con datos declarados */
  months: number[];
  label?: string;
}) {
  if (months.length === 0) return null;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ALL_MONTHS} onValueChange={onChange}>
        <SelectTrigger className="w-[190px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MONTHS}>Todo el año</SelectItem>
          {months.map((m) => (
            <SelectItem key={`acc:${m}`} value={`acc:${m}`}>
              Acumulado a {MONTH_NAMES[m - 1]}
            </SelectItem>
          ))}
          {months.map((m) => (
            <SelectItem key={`m:${m}`} value={`m:${m}`}>
              Solo {MONTH_NAMES[m - 1]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
