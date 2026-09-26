import { describe, expect, it } from "vitest";
import {
  EvidenceReferenceSchema,
  PublicationOriginSchema,
  PublicationSchema,
  assertLifecycleTransition,
  canTransitionLifecycle,
  toPublicPublication,
} from "@/domain/publication";
import { PublicationContentBlocksSchema } from "@/domain/content-blocks";
import { publications } from "@/publications/fixtures";

describe("PublicationSchema", () => {
  it("accepts every complete fixture", () => {
    expect(publications).toHaveLength(4);
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

  it("validates accessible visual blocks, table shapes, and map coordinates", () => {
    expect(PublicationContentBlocksSchema.safeParse([
      { id: "50000000-0000-4000-8000-000000000001", type: "image", url: "https://example.org/image.png", alt: "Development image", caption: "Caption" },
      { id: "50000000-0000-4000-8000-000000000002", type: "table", caption: "Table", columns: [{ key: "a", label: "A" }], rows: [["value"]] },
      { id: "50000000-0000-4000-8000-000000000003", type: "map", title: "Map", caption: "Caption", description: "Text fallback.", features: [{ kind: "point", latitude: 24, longitude: 56, label: "Point" }] },
    ]).success).toBe(true);
    expect(PublicationContentBlocksSchema.safeParse([
      { id: "50000000-0000-4000-8000-000000000001", type: "image", url: "file:///private/image.png", caption: "Caption" },
    ]).success).toBe(false);
    expect(PublicationContentBlocksSchema.safeParse([
      { id: "50000000-0000-4000-8000-000000000001", type: "map", title: "Map", caption: "Caption", description: "Text fallback.", features: [{ kind: "point", latitude: 100, longitude: 56, label: "Point" }] },
    ]).success).toBe(false);
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

  it("projects public correction and methodology notices without internal metadata", () => {
    const publication = {
      ...publications[1],
      extensions: {
        ...publications[1].extensions,
        methodology: "Public methodology.",
        caveat: "Public caveat.",
        publicNotice: {
          kind: "correction" as const,
          note: "A date was corrected.",
          timestamp: "2026-09-24T12:00:00.000Z",
          version: 3,
        },
        overwatch: { confidenceRationale: "internal" },
      },
    };
    const projected = toPublicPublication(publication);
    expect(projected.methodology).toBe("Public methodology.");
    expect(projected.notice?.kind).toBe("correction");
    expect(JSON.stringify(projected)).not.toContain("confidenceRationale");
  });

  it("removes restricted evidence-reference blocks from public output", () => {
    const publication = {
      ...publications[1],
      blocks: [
        { id: "60000000-0000-4000-8000-000000000001", type: "evidence-reference" as const, evidenceId: "8e1b2b86-28de-4ff0-a558-e00f2e8aaf75" },
        { id: "60000000-0000-4000-8000-000000000002", type: "evidence-reference" as const, evidenceId: "4cfa7a2d-28a2-4bb9-9772-b5dcfb91150b" },
      ],
    };
    const projected = toPublicPublication(publication);
    expect(projected.blocks).toHaveLength(1);
    expect(JSON.stringify(projected)).not.toContain("4cfa7a2d-28a2-4bb9-9772-b5dcfb91150b");
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
