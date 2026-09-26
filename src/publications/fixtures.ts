import { PublicationSchema, type Publication } from "@/domain/publication";

const academicResearchArticle = {
  id: "6c8e3db1-1f0e-4bee-a597-85155876bb60",
  slug: "heat-stress-and-urban-response",
  type: "academic-research-article",
  lifecycleState: "published",
  visibility: "public",
  title: "Heat Stress and the Urban Response Window",
  excerpt: "A research synthesis on why overnight heat changes the response threshold for city services.",
  body: [
    "Heat emergencies are often measured by their daytime maximum. That convention misses the accumulated burden created when overnight temperatures remain elevated and recovery becomes impossible.",
    "The evidence reviewed here supports treating consecutive warm nights as an operational trigger. The practical implication is simple: public cooling, welfare checks, and transit contingency plans should begin before the daily peak.",
  ],
  blocks: [
    { id: "10000000-0000-4000-8000-000000000001", type: "heading", level: 2, text: "Overnight exposure" },
    { id: "10000000-0000-4000-8000-000000000002", type: "prose", text: "Consecutive warm nights reduce the recovery time available to households and emergency services." },
    { id: "10000000-0000-4000-8000-000000000003", type: "figure", url: "https://example.org/fixtures/overnight-heat-window.png", alt: "A development sample figure comparing overnight temperatures and response windows.", caption: "Development sample of the overnight heat response window.", source: "Mayday development fixture", figureNumber: 1 },
    { id: "10000000-0000-4000-8000-000000000004", type: "table", caption: "Development sample of response triggers.", columns: [{ key: "indicator", label: "Indicator" }, { key: "response", label: "Response" }], rows: [["Warm nights", "Open cooling sites"], ["Consecutive alerts", "Begin welfare checks"]], evidenceId: "2fa02038-9a44-4934-b5b0-fce2ee0ec5e7", tableNumber: 1 },
    { id: "10000000-0000-4000-8000-000000000005", type: "evidence-reference", evidenceId: "bf4582f8-a5ca-45f3-a582-7f1aa4f5eab5", label: "Mortality review" },
  ],
  publishedAt: "2026-07-14",
  readingTimeMinutes: 8,
  tags: ["climate", "public-health", "research"],
  revision: {
    version: 1,
    updatedAt: "2026-07-14T09:00:00+00:00",
    summary: "Initial publication.",
  },
  provenance: {
    origin: {
      kind: "academic-publication",
      label: "Journal of Urban Climate Adaptation",
      url: "https://example.org/journal/urban-climate-adaptation",
      originatingApplication: "Mayday Research Ingest",
      originatingProject: "Climate Resilience Desk",
      stableObjectId: "article:juac:2026:051",
    },
    createdBy: "Mayday Research Desk",
    createdAt: "2026-07-12T14:30:00+00:00",
    verificationStatus: "verified",
    internalNotes: "Peer-review status and author affiliations checked by the research desk.",
  },
  evidence: [
    {
      id: "bf4582f8-a5ca-45f3-a582-7f1aa4f5eab5",
      title: "Overnight heat mortality review",
      visibility: "citation-only",
      locator: "Methods appendix, table 4",
      citation: {
        id: "f865b4c3-12b6-4f14-b3ee-2283c43101f4",
        title: "Nocturnal heat and excess mortality in dense cities",
        authors: ["L. Chen", "P. Murray"],
        publisher: "Journal of Urban Climate Adaptation",
        publishedAt: "2026-05-02",
        doi: "10.1234/juac.2026.051",
      },
    },
    {
      id: "2fa02038-9a44-4934-b5b0-fce2ee0ec5e7",
      title: "Municipal cooling center guidance",
      description: "Public guidance for planning cooling-center activation.",
      url: "https://example.org/guidance/cooling-centers",
      visibility: "public",
    },
  ],
  sources: [
    {
      id: "f865b4c3-12b6-4f14-b3ee-2283c43101f4",
      title: "Nocturnal heat and excess mortality in dense cities",
      authors: ["L. Chen", "P. Murray"],
      publisher: "Journal of Urban Climate Adaptation",
      publishedAt: "2026-05-02",
      doi: "10.1234/juac.2026.051",
    },
  ],
};

const overwatchOsintReport = {
  id: "340f0c39-af95-45bb-91c9-4e3387413d6a",
  slug: "overwatch-strait-logistics-watch",
  type: "overwatch-osint-report",
  lifecycleState: "updated",
  visibility: "public",
  title: "Overwatch: Strait Logistics Watch",
  excerpt: "Open-source signals indicate a short-term increase in maritime routing pressure through the eastern strait.",
  body: [
    "Commercial vessel position reports show a measurable shift toward longer transit paths during the last seventy-two hours. The pattern is consistent across two independent public feeds, but intent cannot be inferred from routing data alone.",
    "Operators should plan for modest delivery variance and continue to monitor port notices. This dispatch will be updated if official restrictions or corroborating statements emerge.",
  ],
  blocks: [
    { id: "20000000-0000-4000-8000-000000000001", type: "prose", text: "This development sample summarizes public routing observations without inferring intent." },
    { id: "20000000-0000-4000-8000-000000000002", type: "map", title: "Eastern strait routing context", caption: "Development sample geographic context for the routing watch.", description: "A public-reference map marking an eastern strait observation point and the associated monitored route.", features: [{ kind: "point", latitude: 24, longitude: 56, label: "Eastern Strait" }, { kind: "line", label: "Observed route", coordinates: [{ latitude: 24, longitude: 52 }, { latitude: 25, longitude: 56 }, { latitude: 26, longitude: 60 }] }], evidenceId: "8e1b2b86-28de-4ff0-a558-e00f2e8aaf75" },
    { id: "20000000-0000-4000-8000-000000000003", type: "timeline", title: "Reporting window", entries: [{ date: "2026-08-01", title: "Initial observation", description: "Public routing data shows a change in transit paths.", evidenceId: "8e1b2b86-28de-4ff0-a558-e00f2e8aaf75" }, { date: "2026-08-03", title: "Situation report", description: "Dispatch records the observation with a stated caveat." }] },
    { id: "20000000-0000-4000-8000-000000000004", type: "evidence-reference", evidenceId: "8e1b2b86-28de-4ff0-a558-e00f2e8aaf75", label: "Public vessel-position dashboard" },
  ],
  publishedAt: "2026-08-03",
  readingTimeMinutes: 5,
  tags: ["osint", "logistics", "maritime"],
  revision: {
    version: 2,
    previousVersion: 1,
    updatedAt: "2026-08-04T16:45:00+00:00",
    summary: "Added a second public vessel-position source.",
  },
  provenance: {
    origin: {
      kind: "open-source-intelligence",
      label: "Mayday Overwatch desk",
      url: "https://example.org/overwatch/maritime-methodology",
      originatingApplication: "Mayday Overwatch",
      originatingProject: "Maritime Signals",
      stableObjectId: "case:ow-26-0803",
    },
    createdBy: "Overwatch Team",
    createdAt: "2026-08-03T08:00:00+00:00",
    verificationStatus: "corroborated",
    internalNotes: "Analyst identities and raw feed comparison notes are retained in the case record.",
  },
  evidence: [
    {
      id: "8e1b2b86-28de-4ff0-a558-e00f2e8aaf75",
      title: "Public vessel-position dashboard",
      description: "A public dashboard used to corroborate broad routing changes.",
      url: "https://example.org/public-vessel-positions",
      visibility: "public",
    },
    {
      id: "4cfa7a2d-28a2-4bb9-9772-b5dcfb91150b",
      title: "Analyst route comparison",
      visibility: "internal",
      locator: "Case OW-26-0803, worksheet B",
    },
  ],
  sources: [
    {
      id: "9e0f0b0d-1c1c-4d44-835a-e9f7e0c0d1ee",
      title: "Public vessel-position dashboard",
      authors: ["Open Maritime Data Consortium"],
      publisher: "Open Maritime Data Consortium",
      url: "https://example.org/public-vessel-positions",
    },
  ],
};

const shortDispatch = {
  id: "e1fce2f7-cd39-4bba-bb7e-4c79e7d2667d",
  slug: "dispatch-mutual-aid-staging",
  type: "short-dispatch",
  lifecycleState: "published",
  visibility: "public",
  title: "Dispatch: Mutual Aid Staging Opens at 18:00",
  excerpt: "A concise operational notice for partners supporting tonight's severe-weather response.",
  body: [
    "The mutual aid staging point opens at 18:00 local time at the county fairgrounds south entrance. Check-in teams will direct volunteers to transport, supply, and welfare-check assignments.",
    "Bring photo identification, weather-appropriate clothing, and any organization-issued credentials. Do not self-deploy to affected neighborhoods before receiving an assignment.",
  ],
  publishedAt: "2026-09-01",
  readingTimeMinutes: 2,
  tags: ["dispatch", "mutual-aid", "severe-weather"],
  revision: {
    version: 1,
    updatedAt: "2026-09-01T15:10:00+00:00",
    summary: "Initial publication.",
  },
  provenance: {
    origin: {
      kind: "partner-submission",
      label: "County Emergency Coordination Office",
      originatingApplication: "Partner Intake",
      originatingProject: "Severe Weather 2026",
      stableObjectId: "notice:eoc:26-091",
    },
    createdBy: "Mayday Dispatch Desk",
    createdAt: "2026-09-01T14:55:00+00:00",
    verificationStatus: "verified",
    internalNotes: "Callback confirmation recorded with the submitting office.",
  },
  evidence: [
    {
      id: "726f8b9b-e166-453f-b673-17515434e12b",
      title: "Partner operations notice",
      visibility: "private",
      locator: "EOC notice 26-091",
    },
  ],
  sources: [
    {
      id: "11bc1b3c-daeb-43f0-a034-8d9c38ea97a7",
      title: "County Emergency Coordination Office operations notice",
      authors: ["County Emergency Coordination Office"],
      publisher: "County Emergency Coordination Office",
    },
  ],
};

const forecastBrief = {
  id: "a3fce2f7-cd39-4bba-bb7e-4c79e7d2667d",
  slug: "heat-service-outlook",
  type: "forecast-brief",
  lifecycleState: "published",
  visibility: "public",
  title: "Heat Service Outlook",
  excerpt: "A development forecast fixture describing conditions that could increase municipal heat-service demand.",
  body: ["This development fixture demonstrates structured forecast presentation. It does not make a real-world prediction."],
  blocks: [
    { id: "30000000-0000-4000-8000-000000000001", type: "prose", text: "The following indicators are illustrative development content and should not be treated as an operational forecast." },
    { id: "30000000-0000-4000-8000-000000000002", type: "table", caption: "Illustrative forecast indicators.", columns: [{ key: "indicator", label: "Indicator" }, { key: "implication", label: "Potential implication" }], rows: [["Persistent warm nights", "Higher cooling-service demand"], ["Transit disruption", "Reduced access to cooling sites"]], tableNumber: 1 },
    { id: "30000000-0000-4000-8000-000000000003", type: "timeline", title: "Outlook period", entries: [{ date: "2026-09", title: "Seasonal monitoring", description: "Track public heat and service indicators." }, { date: "2026-10", title: "Review", description: "Reassess conditions against documented assumptions." }] },
    { id: "30000000-0000-4000-8000-000000000004", type: "dataset-reference", title: "Municipal heat indicators", description: "Development reference to a public dataset used for indicator monitoring.", source: "Mayday development fixture", url: "https://example.org/datasets/municipal-heat-indicators.csv", format: "CSV", coverage: "Monthly" },
  ],
  publishedAt: "2026-09-15",
  readingTimeMinutes: 4,
  tags: ["forecast", "climate", "development-fixture"],
  revision: { version: 1, updatedAt: "2026-09-15T09:00:00+00:00", summary: "Initial development fixture." },
  provenance: {
    origin: { kind: "original-reporting", label: "Mayday Forecast Desk", originatingApplication: "Mayday Dispatch", originatingProject: "Development fixtures", stableObjectId: "forecast:heat:fixture:1" },
    createdBy: "Mayday Forecast Desk",
    createdAt: "2026-09-15T09:00:00+00:00",
    verificationStatus: "unverified",
  },
  evidence: [],
  sources: [{ id: "31bc1b3c-daeb-43f0-a034-8d9c38ea97a7", title: "Development fixture methodology", authors: ["Mayday Forecast Desk"], publisher: "Mayday Information Systems" }],
};

export const publications: Publication[] = [
  academicResearchArticle,
  overwatchOsintReport,
  shortDispatch,
  forecastBrief,
].map((fixture) => PublicationSchema.parse(fixture));
