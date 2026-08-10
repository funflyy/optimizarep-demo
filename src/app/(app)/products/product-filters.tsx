"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductFiltersProps {
  categories: string[];
  search: string;
  category: string;
  onSearchChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  /**
   * Familias. Se pasa vacío mientras nadie haya cargado una familia explícita:
   * en ese caso el filtro sería idéntico al de categoría y no se muestra.
   */
  families?: string[];
  family?: string;
  onFamilyChange?: (v: string) => void;
}

export function ProductFilters({
  categories,
  search,
  category,
  onSearchChange,
  onCategoryChange,
  families,
  family = "all",
  onFamilyChange,
}: ProductFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por SKU o nombre..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={() => onSearchChange("")}
          >
            <XIcon className="h-3 w-3" />
          </Button>
        )}
      </div>
      {families && families.length > 0 && onFamilyChange && (
        <Select value={family} onValueChange={onFamilyChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todas las familias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las familias</SelectItem>
            {families.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Todas las categorías" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las categorías</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
