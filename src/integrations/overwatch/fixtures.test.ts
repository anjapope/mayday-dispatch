import { describe, expect, it } from "vitest";
import { OverwatchPublicationInputSchema } from "@/integrations/overwatch/dto";
import { overwatchPublicationFixtures } from "@/integrations/overwatch/fixtures";

describe("Overwatch analytical product fixtures", () => {
  it("covers distinct situation, intelligence, and recurring monitoring products", () => {
    expect(overwatchPublicationFixtures.map((fixture) => fixture.publicationType)).toEqual([
      "situation-report",
      "intelligence-brief",
      "short-dispatch",
    ]);
    for (const fixture of overwatchPublicationFixtures) {
      expect(OverwatchPublicationInputSchema.safeParse(fixture).success).toBe(true);
    }

    const [situationReport, intelligenceBrief, monitoringDispatch] = overwatchPublicationFixtures;
    expect(situationReport).toMatchObject({
      evidenceIds: expect.arrayContaining([
        "11111111-1111-4111-8111-111111111111",
        "12121212-1212-4121-8121-121212121212",
      ]),
      assessment: expect.objectContaining({
        assessmentDate: "2026-09-25",
        collectionWindow: expect.any(String),
        geographicScope: expect.any(String),
        corroborationStatus: expect.any(String),
        analyticCaveats: expect.any(Array),
      }),
      seriesId: "eastern-corridor-daily-situation-report",
    });
    expect(intelligenceBrief).toMatchObject({
      citations: expect.arrayContaining([
        expect.objectContaining({ title: "Regional Freight Capacity Review" }),
        expect.objectContaining({ title: "Crossing Throughput Statistics" }),
      ]),
      assessment: expect.objectContaining({
        methodologyNote: expect.any(String),
        confidenceRationale: expect.any(String),
      }),
    });
    expect(monitoringDispatch).toMatchObject({
      readingTimeMinutes: 1,
      assessment: {
        confidenceLevel: "low",
        temporalScope: "2026-09-25 06:00-12:00 UTC",
      },
      seriesId: "port-activity",
    });
    expect(monitoringDispatch?.assessment).not.toHaveProperty("methodologyNote");
    expect(monitoringDispatch?.assessment).not.toHaveProperty("confidenceRationale");
  });
});
