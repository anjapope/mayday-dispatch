import type { Publication } from "@/domain/publication";

export type ReadinessFinding = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
};

export type PublicationReadiness = {
  ready: boolean;
  findings: ReadinessFinding[];
};

export function validatePublicationReadiness(publication: Publication): PublicationReadiness {
  const findings: ReadinessFinding[] = [];
  if (!publication.excerpt.trim()) {
    findings.push({ severity: "error", code: "MISSING_SUMMARY", message: "A summary is required." });
  }
  if (publication.sources.length === 0) {
    findings.push({ severity: "warning", code: "MISSING_CITATIONS", message: "No citations are attached." });
  }
  if (publication.visibility === "public" && publication.evidence.some((evidence) =>
    evidence.visibility === "private" || evidence.visibility === "internal")) {
    findings.push({
      severity: "error",
      code: "RESTRICTED_EVIDENCE",
      message: "Public publications cannot contain private or internal evidence references.",
    });
  }
  if (publication.type.startsWith("overwatch-") || publication.type === "situation-report" ||
      publication.type === "intelligence-brief") {
    const assessment = publication.extensions.overwatch as
      | { assessment?: { geographicScope?: string; temporalScope?: string } }
      | undefined;
    if (!assessment?.assessment?.geographicScope) {
      findings.push({ severity: "warning", code: "MISSING_GEOGRAPHIC_SCOPE", message: "Geographic scope is not recorded." });
    }
    if (!assessment?.assessment?.temporalScope) {
      findings.push({ severity: "warning", code: "MISSING_TEMPORAL_SCOPE", message: "Temporal scope is not recorded." });
    }
  }
  return {
    ready: !findings.some((finding) => finding.severity === "error"),
    findings,
  };
}
