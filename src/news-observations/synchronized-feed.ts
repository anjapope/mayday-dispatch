import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "@/persistence/migrations";
import { IntelligenceObservationCache, SynchronizedObservationProvider } from "@/news-observations/synchronized-cache";
import type { ObservationPage, ObservationProviderStatus } from "@/news-observations/provider";

export function readSynchronizedObservationFeed(): { page: ObservationPage; status: ObservationProviderStatus } {
  const database = new DatabaseSync(process.env.MAYDAY_DATABASE_PATH ?? resolve(process.cwd(), "data", "mayday-dispatch.sqlite"));
  try {
    runMigrations(database);
    const provider = new SynchronizedObservationProvider(new IntelligenceObservationCache(database));
    const status = provider.status;
    return {
      page: {
        observations: new IntelligenceObservationCache(database).listEligible(8),
        provider: "live",
        synthetic: false,
        mode: status.mode,
      },
      status,
    };
  } finally {
    database.close();
  }
}
