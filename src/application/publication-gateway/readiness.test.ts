import { describe, expect, it } from "vitest";
import { validatePublicationReadiness } from "@/application/publication-gateway/readiness";
import { publications } from "@/publications/fixtures";

describe("publication readiness", () => {
  it("returns advisory warnings without blocking a valid publication", () => {
    const result = validatePublicationReadiness({ ...publications[0], sources: [] });
    expect(result.ready).toBe(true);
    expect(result.findings.some((finding) => finding.severity === "warning")).toBe(true);
  });

  it("blocks public publications containing restricted evidence", () => {
    const publication = {
      ...publications[1],
      visibility: "public" as const,
      evidence: [
        ...publications[1].evidence,
        { ...publications[1].evidence[1], visibility: "internal" as const },
      ],
    };
    const result = validatePublicationReadiness(publication);
    expect(result.ready).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "RESTRICTED_EVIDENCE",
      severity: "error",
    }));
  });
});
