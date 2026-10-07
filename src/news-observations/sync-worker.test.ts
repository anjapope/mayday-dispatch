import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/persistence/migrations";
import { IntelligenceSyncWorker, loadWorkerConfig } from "@/news-observations/sync-worker";

const databases: DatabaseSync[] = [];
const directories: string[] = [];
afterEach(() => {
  while (databases.length) databases.pop()!.close();
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  runMigrations(db);
  return db;
}
function config() {
  return { intervalSeconds: 60, maxPages: 1, maxObservations: 2, requestTimeoutMs: 1_000, runTimeoutMs: 5_000, staleAfterSeconds: 60, degradedAfterFailures: 2, maxRetries: 0, retryBaseSeconds: 1 };
}

describe("IntelligenceSyncWorker", () => {
  it("rejects unsafe cadence and inaccessible token files", () => {
    expect(() => loadWorkerConfig({ MAYDAY_INTELLIGENCE_ENDPOINT: "http://127.0.0.1:8765", MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE: "missing" }))
      .toThrow(/accessible/);
    const directory = mkdtempSync(join(tmpdir(), "mayday-worker-"));
    directories.push(directory);
    const token = join(directory, "token");
    writeFileSync(token, "test-token");
    expect(() => loadWorkerConfig({ MAYDAY_INTELLIGENCE_ENDPOINT: "http://127.0.0.1:8765", MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE: token, MAYDAY_INTELLIGENCE_SYNC_INTERVAL_SECONDS: "59" }))
      .toThrow(/60/);
  });

  it("enforces one worker lease and persists pause/resume without touching observations", () => {
    const db = database();
    const sync = { incrementallySynchronize: async () => ({ pagesProcessed: 1, accepted: 0, rejected: 0, duplicates: 0, revisionUpdates: 0 }) };
    const first = new IntelligenceSyncWorker(db, config(), sync as never);
    const second = new IntelligenceSyncWorker(db, config(), sync as never);
    first.acquire();
    expect(() => second.acquire()).toThrow(/already holds/);
    first.pause("operator-1");
    expect(first.status()).toMatchObject({ status: "paused", paused: 1 });
    first.resume("operator-1");
    expect(first.status()).toMatchObject({ status: "starting", paused: 0 });
    first.release();
    second.acquire();
    second.release();
  });
});
