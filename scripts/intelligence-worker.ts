import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { runMigrations } from "@/persistence/migrations";
import { IntelligenceSyncWorker, loadWorkerConfig } from "@/news-observations/sync-worker";

const database = new DatabaseSync(process.env.MAYDAY_DATABASE_PATH ?? resolve(process.cwd(), "data", "mayday-dispatch.sqlite"));
const worker = new IntelligenceSyncWorker(database, loadWorkerConfig());
let timer: ReturnType<typeof setTimeout> | undefined;

async function stop(): Promise<void> {
  if (timer) clearTimeout(timer);
  worker.release();
  database.close();
}

async function schedule(): Promise<void> {
  const interval = loadWorkerConfig().intervalSeconds * 1_000;
  try {
    await worker.runOnce();
  } catch {
    // Durable worker state and bounded audit records capture the failure.
  }
  timer = setTimeout(() => void schedule(), interval);
}

runMigrations(database);
worker.acquire();
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
void schedule();
