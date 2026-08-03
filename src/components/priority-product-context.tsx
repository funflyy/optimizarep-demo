"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { PRIORITY_PRODUCT_COOKIE } from "@/lib/priority-product";
import { trpc } from "@/lib/trpc";

/**
 * Contexto de Producto Prioritario (acuerdo reunión 11-jul):
 * el usuario elige al entrar qué producto prioritario opera y toda la
 * navegación se mueve dentro de ese contexto.
 *
 * PERSISTENCIA: una sola fuente de verdad, la cookie, con solo el `code`.
 *
 * Antes había dos: la cookie guardaba el `code` (y `getActivePriorityProduct`
 * resolvía el id contra la BD en cada request, siempre correcto) y localStorage
 * guardaba el objeto completo con el `id` desnormalizado. Ese `id` es un UUID:
 * al recrearse los catálogos cambió, y las pantallas de cliente que filtraban
 * por él quedaban vacías sin ningún error visible, mientras las de servidor
 * seguían funcionando. Guardar solo el `code`, que es estable, elimina la
 * duplicación y la posibilidad de que servidor y cliente discrepen.
 */

export interface SelectedPriorityProduct {
  id: string;
  code: string;
  name: string;
  decree: string | null;
}

interface PriorityProductContextValue {
  selected: SelectedPriorityProduct | null;
  /** true mientras se lee la cookie o el catálogo (evita parpadeo/redirect) */
  loading: boolean;
  select: (pp: SelectedPriorityProduct) => void;
  clear: () => void;
}

/** localStorage de versiones anteriores; se limpia al arrancar */
const LEGACY_STORAGE_KEY = "optimizarep.priorityProduct";

const COOKIE_MAX_AGE = 31536000; // 1 año

const PriorityProductContext = createContext<PriorityProductContextValue>({
  selected: null,
  loading: true,
  select: () => {},
  clear: () => {},
});

function readCookieCode(): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PRIORITY_PRODUCT_COOKIE}=([^;]*)`)
  );
  const value = match?.[1] ? decodeURIComponent(match[1]) : "";
  return value || null;
}

function writeCookieCode(code: string | null) {
  document.cookie = code
    ? `${PRIORITY_PRODUCT_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
    : `${PRIORITY_PRODUCT_COOKIE}=; path=/; max-age=0`;
  emit();
}

/**
 * La cookie es un store externo, así que se lee con `useSyncExternalStore`.
 * Evita el efecto que setea estado y el desajuste de hidratación: en el
 * servidor no hay `document`, y el snapshot de servidor devuelve null.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): string | null {
  return readCookieCode();
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Migración desde el localStorage de versiones anteriores: se rescata solo el
 * `code` y se descarta el resto, porque el `id` que guardaba puede estar
 * obsoleto. Corre una vez, al cargar el módulo en el cliente.
 */
function migrateLegacyStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as { code?: string };
    if (legacy?.code && !readCookieCode()) writeCookieCode(legacy.code);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

migrateLegacyStorage();

export function PriorityProductProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  /** Único dato persistido: el código, leído directo de la cookie */
  const code = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { data: catalog, isLoading: catalogLoading } =
    trpc.priorityProduct.list.useQuery();

  /** El id y el nombre siempre salen del catálogo, nunca de lo persistido */
  const selected = useMemo<SelectedPriorityProduct | null>(() => {
    if (!code || !catalog) return null;
    const pp = catalog.find((x) => x.code === code);
    if (!pp) return null; // el código ya no existe: obliga a elegir de nuevo
    return { id: pp.id, code: pp.code, name: pp.name, decree: pp.decree };
  }, [code, catalog]);

  const select = useCallback((pp: SelectedPriorityProduct) => {
    writeCookieCode(pp.code);
  }, []);

  const clear = useCallback(() => {
    writeCookieCode(null);
  }, []);

  return (
    <PriorityProductContext.Provider
      value={{ selected, loading: catalogLoading, select, clear }}
    >
      {children}
    </PriorityProductContext.Provider>
  );
}

export function usePriorityProduct() {
  return useContext(PriorityProductContext);
}
