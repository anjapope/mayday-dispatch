import type { PublicPublication } from "@/domain/publication";

export type PublicSection = "global-monitor" | "analysis" | "forecast";

export function publicSectionFor(publication: PublicPublication): PublicSection {
  if (publication.type.includes("forecast") || publication.tags.includes("forecast") || publication.tags.includes("trend-analysis")) {
    return "forecast";
  }
  if (publication.type === "academic-research-article" || publication.type.includes("analysis")) {
    return "analysis";
  }
  return "global-monitor";
}
