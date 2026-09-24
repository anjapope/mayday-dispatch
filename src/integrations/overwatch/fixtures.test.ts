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
    expect(overwatchPublicationFixtures[0]?.assessment?.geographicScope).not.toBe(
      overwatchPublicationFixtures[1]?.assessment?.methodologyNote,
    );
    expect(overwatchPublicationFixtures[2]?.seriesId).toBe("port-activity");
  });
});
