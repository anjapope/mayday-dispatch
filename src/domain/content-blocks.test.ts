import { describe, expect, it } from "vitest";
import {
  PublicationContentBlocksSchema,
  PublicationContentBlockSchema,
  PublicationPlainTextSchema,
  PublicUrlSchema,
} from "@/domain/content-blocks";

const blockId = "10000000-0000-4000-8000-000000000001";

describe("public publication content validation", () => {
  it("allows public HTTP(S) sources and rejects executable or private-network URLs", () => {
    expect(PublicUrlSchema.safeParse("https://example.org/report").success).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://example.org/file",
      "http://localhost/private",
      "http://127.0.0.1/admin",
      "http://10.0.0.4/private",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/admin",
      "https://user:secret@example.org/report",
    ]) {
      expect(PublicUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("rejects markup and internal filesystem paths in public prose", () => {
    expect(PublicationPlainTextSchema.safeParse("Evidence is incomplete.").success).toBe(true);
    for (const text of [
      "<script>alert(1)</script>",
      "<iframe src=\"https://attacker.example\"></iframe>",
      "<img src=x onerror=alert(1)>",
      "Collection saved at C:\\Users\\analyst\\source.pdf",
      "Source stored at /home/analyst/private/source.pdf",
      "Mounted at \\\\research-server\\restricted\\collection",
    ]) {
      expect(PublicationPlainTextSchema.safeParse(text).success, text).toBe(false);
    }
  });

  it("requires safe image URLs, accessible text, and an exact structured shape", () => {
    const validImage = {
      id: blockId,
      type: "image",
      url: "https://example.org/figure.png",
      alt: "A neutral sample chart.",
      caption: "Sample chart.",
    };
    expect(PublicationContentBlocksSchema.safeParse([validImage]).success).toBe(true);
    expect(PublicationContentBlocksSchema.safeParse([{
      ...validImage,
      url: "file:///private/evidence.png",
    }]).success).toBe(false);
    expect(PublicationContentBlockSchema.safeParse({
      ...validImage,
      onerror: "alert(1)",
    }).success).toBe(false);
    expect(PublicationContentBlocksSchema.safeParse([{
      ...validImage,
      alt: undefined,
    }]).success).toBe(false);
  });

  it("validates evidence references, tables, and map coordinates", () => {
    expect(PublicationContentBlockSchema.safeParse({
      id: blockId,
      type: "evidence-reference",
      evidenceId: "20000000-0000-4000-8000-000000000001",
    }).success).toBe(true);
    expect(PublicationContentBlocksSchema.safeParse([{
      id: blockId,
      type: "table",
      caption: "An invalid table.",
      columns: [{ key: "status", label: "Status" }],
      rows: [["Released", "Unexpected"]],
    }]).success).toBe(false);
    expect(PublicationContentBlockSchema.safeParse({
      id: blockId,
      type: "map",
      title: "Invalid map",
      caption: "Invalid coordinates.",
      description: "This map should not parse.",
      features: [{
        kind: "point",
        latitude: 91,
        longitude: 0,
        label: "Out of range",
      }],
    }).success).toBe(false);
  });

  it("rejects unknown executable media block types and duplicate block identifiers", () => {
    expect(PublicationContentBlockSchema.safeParse({
      id: blockId,
      type: "iframe",
      url: "https://example.org/embed",
    }).success).toBe(false);
    expect(PublicationContentBlocksSchema.safeParse([
      { id: blockId, type: "prose", text: "First paragraph." },
      { id: blockId, type: "prose", text: "Second paragraph." },
    ]).success).toBe(false);
  });
});
