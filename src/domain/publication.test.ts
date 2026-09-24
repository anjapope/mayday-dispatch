import { describe, expect, it } from "vitest";
import {
  EvidenceReferenceSchema,
  PublicationOriginSchema,
  PublicationSchema,
  assertLifecycleTransition,
  canTransitionLifecycle,
  toPublicPublication,
} from "@/domain/publication";
import { publications } from "@/publications/fixtures";

describe("PublicationSchema", () => {
  it("accepts every complete fixture", () => {
    expect(publications).toHaveLength(3);
    for (const publication of publications) {
      expect(PublicationSchema.safeParse(publication).success).toBe(true);
    }
  });

  it("rejects published content without a source", () => {
    const invalid = { ...publications[0], sources: [] };

    expect(PublicationSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a malformed publication type", () => {
    const invalid = { ...publications[0], type: "Research Article" };

    expect(PublicationSchema.safeParse(invalid).success).toBe(false);
  });

  it("requires a valid publication visibility classification", () => {
    const invalid = { ...publications[0], visibility: "partners-only" };

    expect(PublicationSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an unsupported lifecycle state", () => {
    const invalid = { ...publications[0], lifecycleState: "released" };

    expect(PublicationSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("lifecycle transitions", () => {
  it("allows explicit forward transitions and prevents invalid transitions", () => {
    expect(canTransitionLifecycle("draft", "review")).toBe(true);
    expect(canTransitionLifecycle("published", "ready")).toBe(false);
    expect(() => assertLifecycleTransition("archived", "draft")).toThrow(
      'Cannot transition a publication from "archived" to "draft".',
    );
  });
});

describe("evidence visibility", () => {
  it("requires citation metadata for citation-only evidence", () => {
    const evidence = {
      ...publications[0].evidence[0],
      citation: undefined,
    };

    expect(EvidenceReferenceSchema.safeParse(evidence).success).toBe(false);
  });

  it("does not disclose restricted evidence, provenance, or visibility in public output", () => {
    const publicPublication = toPublicPublication(publications[1]);

    expect(publicPublication.evidence).toHaveLength(1);
    expect(publicPublication.evidence[0]?.title).toBe("Public vessel-position dashboard");
    expect("provenance" in publicPublication).toBe(false);
    expect("visibility" in publicPublication).toBe(false);
    expect(JSON.stringify(publicPublication)).not.toContain("Case OW-26-0803");
    expect(JSON.stringify(publicPublication)).not.toContain("Maritime Signals");
    expect(JSON.stringify(publicPublication)).not.toContain("confidenceRationale");
    expect(JSON.stringify(publicPublication)).not.toContain("extensions");
  });

  it("does not create public projections for non-public publications", () => {
    const internalPublication = {
      ...publications[0],
      visibility: "internal" as const,
    };

    expect(() => toPublicPublication(internalPublication)).toThrow(
      'Cannot create a public projection for a "internal" publication.',
    );
  });
});

describe("origins", () => {
  it("requires URLs and stable source context for academic and OSINT origins", () => {
    expect(
      PublicationOriginSchema.safeParse({
        kind: "academic-publication",
        label: "Research journal",
        originatingApplication: "Research ingest",
        originatingProject: "Climate desk",
        stableObjectId: "article:123",
      }).success,
    ).toBe(false);
    expect(
      PublicationOriginSchema.safeParse({
        kind: "original-reporting",
        label: "Field team",
        originatingApplication: "Field desk",
        originatingProject: "Flood response",
        stableObjectId: "report:field:42",
      }).success,
    ).toBe(true);
  });

  it("rejects origin records without application, project, or a path-like object ID", () => {
    const origin = publications[0].provenance.origin;

    expect(
      PublicationOriginSchema.safeParse({
        ...origin,
        originatingApplication: "",
      }).success,
    ).toBe(false);
    expect(
      PublicationOriginSchema.safeParse({
        ...origin,
        originatingProject: "",
      }).success,
    ).toBe(false);
    expect(
      PublicationOriginSchema.safeParse({
        ...origin,
        stableObjectId: "C:\\workspace\\article.json",
      }).success,
    ).toBe(false);
  });
});
