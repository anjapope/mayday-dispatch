import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { createConfiguredLiveIntelligenceProvider } from "@/news-observations/intelligence-transport";
import { IntelligenceObservationCache, ManualIntelligenceSynchronizer } from "@/news-observations/synchronized-cache";
import { runMigrations } from "@/persistence/migrations";

const enabled = process.env.MAYDAY_RUN_REAL_PROVIDER_REHEARSAL === "true";
const database = enabled
  ? new DatabaseSync(process.env.MAYDAY_DATABASE_PATH ?? resolve(process.cwd(), "data", "mayday-dispatch.sqlite"))
  : undefined;

afterAll(() => database?.close());

describe.runIf(enabled)("controlled real Intelligence provider rehearsal", () => {
  it("performs a bounded backfill, duplicate-safe replay, and bounded incremental retrieval", async () => {
    if (!database) throw new Error("The real-provider rehearsal database is unavailable.");
    runMigrations(database);
    const cache = new IntelligenceObservationCache(database);
    const synchronizer = new ManualIntelligenceSynchronizer(createConfiguredLiveIntelligenceProvider(), cache);
    const before = Number((database.prepare("SELECT COUNT(*) AS count FROM intelligence_observations").get() as { count: number }).count);
    const bounds = { pageSize: 2, maximumPages: 1, maximumAcceptedObservations: 2 };
    const backfill = await synchronizer.backfill(bounds);
    const replay = await synchronizer.backfill(bounds);
    const incremental = await synchronizer.incrementallySynchronize(bounds);
    const documents = database.prepare(`
      SELECT document_id FROM intelligence_observations
      WHERE provider_id = 'mayday-intelligence-int-del-001c'
      ORDER BY document_id LIMIT 2
    `).all() as Array<{ document_id: string }>;
    expect(documents).toHaveLength(2);
    const eligibleReview = cache.reviewEligibility(
      documents[0].document_id,
      "eligible",
      { subjectId: "dispatch-rehearsal-operator", application: "Dispatch Operations" },
      "Controlled TGH-INT-003D rehearsal.",
    );
    const ineligibleReview = cache.reviewEligibility(
      documents[1].document_id,
      "ineligible",
      { subjectId: "dispatch-rehearsal-operator", application: "Dispatch Operations" },
      "Controlled TGH-INT-003D rehearsal.",
    );
    const reviewedReplay = await synchronizer.backfill(bounds);
    const after = Number((database.prepare("SELECT COUNT(*) AS count FROM intelligence_observations").get() as { count: number }).count);
    console.info(JSON.stringify({
      rehearsal: "controlled-real-provider",
      bounds,
      before,
      after,
      backfill,
      replay: { accepted: replay.accepted, duplicates: replay.duplicates },
      incremental,
      review: { eligible: eligibleReview.documentId, ineligible: ineligibleReview.documentId },
      reviewedReplay: { duplicates: reviewedReplay.duplicates },
      backfillCheckpoint: cache.checkpoint("backfill"),
      incrementalCheckpoint: cache.checkpoint("incremental"),
    }));
    expect(backfill.pagesProcessed).toBeGreaterThan(0);
    expect(replay.duplicates).toBeGreaterThan(0);
    expect(incremental.pagesProcessed).toBeGreaterThan(0);
    expect(reviewedReplay.duplicates).toBeGreaterThan(0);
    expect(cache.listEligible()).toHaveLength(1);
  });
});
