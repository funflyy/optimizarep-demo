"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PRIORITY_PRODUCT_COOKIE } from "@/lib/priority-product";
import { trpc } from "@/lib/trpc";

/**
 * Contexto de Producto Prioritario (acuerdo reunión 11-jul):
 * el usuario elige al entrar qué producto prioritario opera y toda la
 * navegación se mueve dentro de ese contexto. La selección persiste en
 * localStorage; en Fase 3 se ligará a organization_priority_products.
 */

export interface SelectedPriorityProduct {
  id: string;
  code: string;
  name: string;
  decree: string | null;
}

interface PriorityProductContextValue {
  selected: SelectedPriorityProduct | null;
  /** true mientras se lee localStorage (evita parpadeo/redirect prematuro) */
  loading: boolean;
  select: (pp: SelectedPriorityProduct) => void;
  clear: () => void;
}

const STORAGE_KEY = "optimizarep.priorityProduct";

const PriorityProductContext = createContext<PriorityProductContextValue>({
  selected: null,
  loading: true,
  select: () => {},
  clear: () => {},
});

export function PriorityProductProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<SelectedPriorityProduct | null>(null);
  const [loading, setLoading] = useState(true);

  // Catálogo vivo, para revalidar el id guardado
  const { data: catalog } = trpc.priorityProduct.list.useQuery();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SelectedPriorityProduct;
        setSelected(parsed);
        // Mantener la cookie espejo sincronizada (selecciones previas)
        document.cookie = `${PRIORITY_PRODUCT_COOKIE}=${parsed.code}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoading(false);
  }, []);

  /**
   * Selección efectiva: el `id` guardado se revalida contra el catálogo.
   *
   * El `id` es un UUID que cambia si se recrean los productos prioritarios
   * (pasó al recargar los catálogos). Una selección vieja dejaba un id
   * inexistente en localStorage y las pantallas que filtran por él quedaban
   * vacías, sin ningún error visible — la de Tarifas mostraba solo el título.
   * El `code` sí es estable, así que se usa para reencontrar el id correcto.
   *
   * Se deriva en render en vez de guardarse: así no hace falta reescribir
   * localStorage y la reconciliación ocurre siempre, incluso si el catálogo
   * cambia mientras la pestaña está abierta.
   */
  const effective = useMemo<SelectedPriorityProduct | null>(() => {
    if (!selected) return null;
    if (!catalog) return selected; // sin catálogo aún: usar lo guardado
    const fresh = catalog.find((pp) => pp.code === selected.code);
    if (!fresh) return null; // ya no existe: obliga a elegir de nuevo
    return {
      id: fresh.id,
      code: fresh.code,
      name: fresh.name,
      decree: fresh.decree,
    };
  }, [selected, catalog]);

  const select = useCallback((pp: SelectedPriorityProduct) => {
    setSelected(pp);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pp));
    // Cookie espejo para que los componentes de servidor (comparador,
    // tarifas) puedan filtrar por el producto prioritario activo
    document.cookie = `${PRIORITY_PRODUCT_COOKIE}=${pp.code}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const clear = useCallback(() => {
    setSelected(null);
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${PRIORITY_PRODUCT_COOKIE}=; path=/; max-age=0`;
  }, []);

  return (
    <PriorityProductContext.Provider
      value={{ selected: effective, loading, select, clear }}
    >
      {children}
    </PriorityProductContext.Provider>
  );
}

export function usePriorityProduct() {
  return useContext(PriorityProductContext);
}
