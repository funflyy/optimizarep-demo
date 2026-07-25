import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

/**
 * Singleton pattern — en desarrollo, Next.js hot-reload crea múltiples
 * instancias. Guardamos el cliente en globalThis para reusar.
 */
const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
};

const queryClient =
  globalForDb.pgClient ??
  postgres(connectionString, {
    max: 10, // Limitar conexiones en pool
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = queryClient;
}

export const db = drizzle(queryClient, { schema });
