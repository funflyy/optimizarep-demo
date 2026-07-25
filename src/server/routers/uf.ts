import { createTRPCRouter, publicProcedure } from "@/server/trpc";
import { db } from "@/server/db";
import { ufValues } from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * Valor UF del día — cacheado en la tabla uf_values (una fila por fecha).
 *
 * Fuente primaria: Banco Central de Chile (scrape del indicador de portada,
 * mismo enfoque del microservicio Express previo de PYBOT).
 * Respaldo: mindicador.cl (API que replica datos del Banco Central), por si
 * cambia el HTML de bcentral.cl.
 *
 * El costo REP se mantiene en UF; el CLP es referencial (acuerdo 11-jul).
 */

const BCENTRAL_URL = "https://www.bcentral.cl/web/banco-central/inicio";

const MESES: Record<string, string> = {
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05",
  junio: "06", julio: "07", agosto: "08", septiembre: "09",
  octubre: "10", noviembre: "11", diciembre: "12",
};

async function fetchUfFromBcentral(): Promise<{ date: string; value: number } | null> {
  try {
    const res = await fetch(BCENTRAL_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Indicador de portada: <div class='tooltip-wrap' title="UF: Unidad de Fomento">
    // ... <p ...>$40.844,79</p>
    const anchor = html.indexOf('title="UF: Unidad de Fomento"');
    if (anchor < 0) return null;
    const block = html.slice(anchor, anchor + 1500);
    const valueMatch = block.match(/\$\s*([\d.]+,\d{2})/);
    if (!valueMatch) return null;
    const value = Number(valueMatch[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return null;

    // Fecha mostrada justo antes del bloque de indicadores: "13 de julio de 2026"
    const before = html.slice(Math.max(0, anchor - 3000), anchor);
    const dateMatch = before.match(/(\d{1,2}) de ([a-záéíóúñ]+) de (\d{4})/i);
    const date = dateMatch
      ? `${dateMatch[3]}-${MESES[dateMatch[2].toLowerCase()] ?? "01"}-${dateMatch[1].padStart(2, "0")}`
      : new Date().toISOString().slice(0, 10);

    return { date, value };
  } catch {
    return null;
  }
}

async function fetchUfFromMindicador(): Promise<{ date: string; value: number } | null> {
  try {
    const res = await fetch("https://mindicador.cl/api/uf", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      serie?: { fecha: string; valor: number }[];
    };
    const latest = data.serie?.[0];
    if (!latest?.valor) return null;
    return { date: latest.fecha.slice(0, 10), value: latest.valor };
  } catch {
    return null;
  }
}

export const ufRouter = createTRPCRouter({
  current: publicProcedure.query(async () => {
    const today = new Date().toISOString().slice(0, 10);

    // 1. ¿Ya tenemos la UF de hoy en cache?
    const [cached] = await db
      .select()
      .from(ufValues)
      .where(eq(ufValues.date, today))
      .limit(1);
    if (cached) {
      return {
        date: cached.date,
        valueClp: Number(cached.valueClp),
        source: cached.source,
        stale: false,
      };
    }

    // 2. Último valor en DB — si es de hoy o ayer, no re-fetchar
    const [last] = await db
      .select()
      .from(ufValues)
      .orderBy(desc(ufValues.date))
      .limit(1);
    if (last) {
      const ageMs =
        new Date(today).getTime() - new Date(last.date).getTime();
      if (ageMs <= 86_400_000) {
        return {
          date: last.date,
          valueClp: Number(last.valueClp),
          source: last.source,
          stale: false,
        };
      }
    }

    // 3. Fetch: mindicador (dato diario confiable) → bcentral (respaldo)
    const fromMindicador = await fetchUfFromMindicador();
    const fromBcentral = !fromMindicador ? await fetchUfFromBcentral() : null;
    const fresh = fromMindicador ?? fromBcentral;
    if (fresh) {
      const source = fromMindicador ? "mindicador.cl" : "bcentral.cl";
      await db
        .insert(ufValues)
        .values({ date: fresh.date, valueClp: fresh.value.toFixed(2), source })
        .onConflictDoNothing();
      return { date: fresh.date, valueClp: fresh.value, source, stale: false };
    }

    // 4. Fallback: último valor conocido (marcado como desactualizado)
    if (last) {
      return {
        date: last.date,
        valueClp: Number(last.valueClp),
        source: last.source,
        stale: true,
      };
    }
    return null;
  }),
});
