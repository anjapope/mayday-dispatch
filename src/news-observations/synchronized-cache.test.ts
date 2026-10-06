import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { newsObservationFixtures } from "@/news-observations/fixtures";
import { runMigrations } from "@/persistence/migrations";
import { IntelligenceObservationCache, SynchronizedObservationProvider } from "@/news-observations/synchronized-cache";

const databases: DatabaseSync[] = [];
afterEach(() => {
  while (databases.length) databases.pop()!.close();
});

function cache(): IntelligenceObservationCache {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  runMigrations(database);
  return new IntelligenceObservationCache(database);
}

describe("IntelligenceObservationCache", () => {
  it("migrates independently, persists an observation once, and advances its checkpoint transactionally", () => {
    const subject = cache();
    subject.applyPage("backfill", [newsObservationFixtures.validRss], "document-1");
    expect(subject.applyPage("backfill", [newsObservationFixtures.validRss], "document-1")).toMatchObject({ duplicates: 1 });
    expect(subject.database.prepare("SELECT COUNT(*) AS count FROM intelligence_observations").get()).toMatchObject({ count: 1 });
    expect(subject.checkpoint("backfill")).toBe("document-1");
    expect(subject.database.prepare("SELECT observations_accepted, duplicates FROM intelligence_sync_checkpoints").get())
      .toMatchObject({ observations_accepted: 2, duplicates: 1 });
  });

  it("does not project ineligible synchronized observations and exposes an unavailable cache explicitly", async () => {
    const subject = cache();
    subject.applyPage("incremental", [newsObservationFixtures.requiresReviewEligibility], undefined);
    const provider = new SynchronizedObservationProvider(subject, 60_000);
    await expect(provider.list()).resolves.toMatchObject({
      observations: [],
      mode: "synchronized-current",
      synthetic: false,
    });

  });

  it("requires an explicit review, audits the operator, and preserves eligibility through replay", () => {
    const subject = cache();
    subject.applyPage("backfill", [newsObservationFixtures.requiresReviewEligibility], "cursor-1");
    const documentId = newsObservationFixtures.requiresReviewEligibility.identity.intelligenceDocumentId;
    const review = subject.reviewEligibility(documentId, "eligible", { subjectId: "operations-1", application: "Dispatch Operations" }, "Controlled rehearsal.");
    expect(review).toMatchObject({ priorEligibility: "requires_review", eligibility: "eligible", operator: { subjectId: "operations-1" } });
    expect(subject.listEligible()).toHaveLength(1);
    expect(subject.database.prepare("SELECT operator_subject_id, new_eligibility FROM intelligence_observation_review_audit_events").get())
      .toMatchObject({ operator_subject_id: "operations-1", new_eligibility: "eligible" });
    expect(() => subject.reviewEligibility(documentId, "ineligible", { subjectId: "operations-1" })).toThrow(/requires_review/);
    const changed = {
      ...newsObservationFixtures.requiresReviewEligibility,
      source: { ...newsObservationFixtures.requiresReviewEligibility.source, headline: "Updated source headline" },
    };
    expect(subject.applyPage("backfill", [changed], "cursor-2")).toMatchObject({ revisionUpdates: 1 });
    expect(subject.listEligible()).toHaveLength(1);
  });
});
