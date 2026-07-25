"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FilterIcon } from "lucide-react";

interface DashboardFiltersProps {
  years: number[];
  year: string;
  segment: string;
  onYearChange: (v: string) => void;
  onSegmentChange: (v: string) => void;
}

export function DashboardFilters({
  years,
  year,
  segment,
  onYearChange,
  onSegmentChange,
}: DashboardFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <FilterIcon className="h-4 w-4 text-muted-foreground" />
      <Select value={year} onValueChange={onYearChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los años</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={segment} onValueChange={onSegmentChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Segmento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los segmentos</SelectItem>
          <SelectItem value="dom">Domiciliario</SelectItem>
          <SelectItem value="nodom">No Domiciliario</SelectItem>
        </SelectContent>
      </Select>

      {(year !== "all" || segment !== "all") && (
        <Badge
          variant="secondary"
          className="cursor-pointer"
          onClick={() => {
            onYearChange("all");
            onSegmentChange("all");
          }}
        >
          Limpiar filtros ✕
        </Badge>
      )}
    </div>
  );
}
