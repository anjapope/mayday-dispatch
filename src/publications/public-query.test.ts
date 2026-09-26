import { describe, expect, it } from "vitest";
import type { PublicPublication } from "@/domain/publication";
import { publicSectionFor } from "@/publications/public-query";

function matchesPublicBrowse(
  publication: PublicPublication,
  filters: { query?: string; type?: string; tag?: string; seriesId?: string },
): boolean {
  const query = filters.query?.toLowerCase();
  const text = [publication.title, publication.subtitle, publication.excerpt, ...publication.tags, ...publication.body]
    .filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
  return (!filters.type || publication.type === filters.type) &&
    (!filters.tag || publication.tags.includes(filters.tag)) &&
    (!filters.seriesId || publication.seriesId === filters.seriesId) &&
    (!query || text.includes(query));
}

const publication: PublicPublication = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "public-report", type: "situation-report",
  lifecycleState: "published", title: "Public situation report", excerpt: "A concise public summary.",
  body: ["Public reporting body."], publishedAt: "2026-09-25", readingTimeMinutes: 3, tags: ["climate"],
  revision: { version: 1, updatedAt: "2026-09-25T10:00:00Z", summary: "Initial publication.", revisionType: "editorial" },
  sources: [], evidence: [], seriesId: "climate-watch",
};

describe("public publication browse filters", () => {
  it("matches only public-safe indexed fields", () => {
    expect(matchesPublicBrowse(publication, { query: "summary" })).toBe(true);
    expect(matchesPublicBrowse(publication, { tag: "climate" })).toBe(true);
    expect(matchesPublicBrowse(publication, { type: "situation-report" })).toBe(true);
    expect(matchesPublicBrowse(publication, { seriesId: "climate-watch" })).toBe(true);
    expect(matchesPublicBrowse(publication, { query: "internal provenance" })).toBe(false);
  });

  it("classifies public work into restrained public sections", () => {
    expect(publicSectionFor(publication)).toBe("global-monitor");
    expect(publicSectionFor({ ...publication, type: "academic-research-article" })).toBe("analysis");
    expect(publicSectionFor({ ...publication, tags: ["forecast"] })).toBe("forecast");
  });
});
