import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  INTELLIGENCE_CONSUMER_API_VERSION,
  LiveConsumerError,
  LiveIntelligenceObservationProvider,
  type IntelligenceConsumerCredentials,
  type IntelligenceConsumerTransport,
} from "@/news-observations/live-consumer";
import { NEWS_OBSERVATION_PROTOCOL, type NewsObservation } from "@/news-observations/contract";
import type { ObservationQuery } from "@/news-observations/provider";

export const INTELLIGENCE_DOCUMENT_PROTOCOL = "mayday.intelligence.document/1" as const;
const MAX_ENDPOINT_RESPONSE_BYTES = 1_048_576;

const ProviderErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000),
    request_id: z.string().min(1).max(200),
  }).strict(),
}).strict();

const ProviderDocumentSchema = z.object({
  protocol_version: z.literal(INTELLIGENCE_DOCUMENT_PROTOCOL),
  document_id: z.string().min(1).max(200),
  source_record_id: z.string().min(1).max(200).optional().nullable(),
  source_record_identity: z.string().min(1).max(200).optional().nullable(),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(5_000).optional().nullable(),
  canonical_url: z.string().url().optional().nullable(),
  publisher: z.string().min(1).max(300).optional().nullable(),
  source_type: z.string().min(1).max(100).optional().nullable(),
  publication_time: z.string().optional().nullable(),
  retrieval_time: z.string().optional().nullable(),
  storage_time: z.string().optional().nullable(),
  provenance: z.array(z.record(z.string(), z.unknown())).max(50),
  connector_id: z.string().min(1).max(200).optional().nullable(),
  source_id: z.string().min(1).max(200).optional().nullable(),
  source_name: z.string().min(1).max(300).optional().nullable(),
  topics: z.array(z.string().min(1).max(100)).max(20),
  geography: z.record(z.string(), z.unknown()).optional().nullable(),
  verification: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

const ProviderPageSchema = z.object({
  items: z.array(ProviderDocumentSchema).max(100),
  total: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().max(128).nullable().optional(),
  next_cursor: z.string().max(128).nullable().optional(),
}).strict();

type ProviderDocument = z.infer<typeof ProviderDocumentSchema>;

export type IntelligenceTransportOptions = {
  endpoint: string;
  token: string;
  timeoutMs?: number;
  maximumResponseBytes?: number;
  fetchImplementation?: typeof fetch;
};

export function intelligenceCredentialsFromEnvironment(environment = process.env): IntelligenceConsumerCredentials | undefined {
  const endpoint = environment.MAYDAY_INTELLIGENCE_ENDPOINT?.trim();
  const tokenFile = environment.MAYDAY_INTELLIGENCE_CONSUMER_TOKEN_FILE?.trim();
  const token = tokenFile ? readFileSync(tokenFile, "utf8").trim() : environment.MAYDAY_INTELLIGENCE_CONSUMER_TOKEN?.trim();
  if (!endpoint || !token) return undefined;
  return { bearerToken: token, endpoint };
}

export function createConfiguredLiveIntelligenceProvider(environment = process.env): LiveIntelligenceObservationProvider {
  const credentials = intelligenceCredentialsFromEnvironment(environment);
  if (!credentials?.endpoint) {
    throw new Error("MAYDAY_INTELLIGENCE_ENDPOINT and an Intelligence consumer token or token file are required.");
  }
  const transport = new MaydayIntelligenceTransport({
    endpoint: credentials.endpoint,
    token: credentials.bearerToken,
  });
  return new LiveIntelligenceObservationProvider({ transport, credentials: () => credentials, maxPageSize: 100 });
}

function timestamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  return Number.isNaN(Date.parse(normalized)) ? undefined : new Date(normalized).toISOString();
}

function safeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 200);
}

function sourceType(value: string | null | undefined): NewsObservation["source"]["sourceType"] {
  return value === "rss" || value === "academic" || value === "newswire" || value === "government" || value === "organization"
    ? value
    : "other";
}

function mapDocument(document: ProviderDocument): NewsObservation {
  const acquiredAt = timestamp(document.retrieval_time) ?? timestamp(document.storage_time);
  const publishedAt = timestamp(document.publication_time);
  if (!document.canonical_url || !document.publisher || !acquiredAt) {
    throw new LiveConsumerError("invalid-response", "An Intelligence document lacks required Dispatch presentation fields.");
  }
  const observationId = `intelligence:${safeIdentifier(document.document_id)}`;
  return {
    protocol: NEWS_OBSERVATION_PROTOCOL,
    identity: {
      observationId,
      intelligenceDocumentId: safeIdentifier(document.document_id),
      sourceRecordId: document.source_record_id ? safeIdentifier(document.source_record_id) : undefined,
      revisionId: safeIdentifier(document.document_id),
    },
    source: {
      headline: document.title,
      summary: document.summary ?? undefined,
      publisher: document.publisher,
      canonicalUrl: document.canonical_url,
      sourceType: sourceType(document.source_type),
      publishedAt,
    },
    provenance: {
      originatingSystem: "mayday-intelligence",
      sourceReference: safeIdentifier(document.source_record_identity ?? document.source_record_id ?? document.document_id),
      acquisitionReference: document.connector_id ? safeIdentifier(document.connector_id) : undefined,
      evidenceIds: [],
      verificationState: "unknown",
      transformationLineage: [`INT-DEL-001C:${document.document_id}`],
    },
    topics: {
      identifiers: document.topics.filter((topic) => /^[a-z][a-z0-9-]*$/.test(topic)),
      sourceTags: document.topics.filter((topic) => !/^[a-z][a-z0-9-]*$/.test(topic)),
    },
    temporal: { acquiredAt, observedAt: acquiredAt, updatedAt: acquiredAt, freshness: "unknown" },
    geography: [],
    relatedObservationIds: [],
    // INT-DEL-001C does not expose a feed-eligibility decision. Dispatch must
    // not manufacture one during synchronization.
    publicFeed: { eligibility: "requires_review", reasons: ["verification-pending"] },
  };
}

export class MaydayIntelligenceTransport implements IntelligenceConsumerTransport {
  private readonly endpoint: URL;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maximumResponseBytes: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: IntelligenceTransportOptions) {
    this.endpoint = new URL(options.endpoint);
    if (!/^https?:$/.test(this.endpoint.protocol)) throw new Error("The Intelligence endpoint must use HTTP or HTTPS.");
    this.token = options.token.trim();
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maximumResponseBytes = options.maximumResponseBytes ?? MAX_ENDPOINT_RESPONSE_BYTES;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    if (!this.token || !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || !Number.isInteger(this.maximumResponseBytes) || this.maximumResponseBytes < 1) {
      throw new Error("Intelligence transport configuration is invalid.");
    }
  }

  async discoverCapabilities(credentials: IntelligenceConsumerCredentials): Promise<unknown> {
    void credentials;
    // INT-DEL-001C intentionally has no capability route. This static document
    // records the frozen, verified consumer surface for the existing boundary.
    return {
      serviceId: "mayday-intelligence-int-del-001c",
      apiVersion: INTELLIGENCE_CONSUMER_API_VERSION,
      observationSchemaVersion: NEWS_OBSERVATION_PROTOCOL,
      operations: { listObservations: true, getObservation: true },
      pagination: { method: "cursor", maximumPageSize: 100 },
      filters: { topic: false, temporal: true },
      references: { provenance: true, source: true, geography: true },
      healthStatus: true,
      limits: { maximumResponseBytes: this.maximumResponseBytes },
    };
  }

  async getStatus(credentials: IntelligenceConsumerCredentials): Promise<unknown> {
    void credentials;
    const response = await this.request("/api/v1/provider/health");
    const parsed = z.object({ status: z.literal("healthy"), provider: z.literal("ready"), auth: z.literal("bearer") }).passthrough().safeParse(response);
    if (!parsed.success) throw new LiveConsumerError("invalid-response", "The Intelligence provider health response was invalid.");
    return { status: "ok" };
  }

  async listObservations(query: ObservationQuery, credentials: IntelligenceConsumerCredentials): Promise<unknown> {
    void credentials;
    if (query.topic) throw new LiveConsumerError("invalid-response", "INT-DEL-001C does not support topic filtering.");
    const payload = await this.request("/api/v1/provider/documents", {
      limit: String(query.limit ?? 25),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.from ? { since: query.from } : {}),
      ...(query.to ? { until: query.to } : {}),
    });
    const page = ProviderPageSchema.safeParse(payload);
    if (!page.success || page.data.items.length > (query.limit ?? 25)) {
      throw new LiveConsumerError("invalid-response", "The Intelligence provider document page was invalid.");
    }
    return {
      observations: page.data.items.map(mapDocument),
      nextCursor: page.data.next_cursor ?? undefined,
    };
  }

  async getObservation(observationId: string, credentials: IntelligenceConsumerCredentials): Promise<unknown> {
    void credentials;
    const documentId = observationId.replace(/^intelligence:/, "");
    return mapDocument(ProviderDocumentSchema.parse(await this.request(`/api/v1/provider/documents/${encodeURIComponent(documentId)}`)));
  }

  private async request(path: string, query?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.endpoint);
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: controller.signal,
      });
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > this.maximumResponseBytes) throw new LiveConsumerError("invalid-response", "The Intelligence response exceeded the configured limit.");
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > this.maximumResponseBytes) throw new LiveConsumerError("invalid-response", "The Intelligence response exceeded the configured limit.");
      const payload: unknown = JSON.parse(new TextDecoder().decode(body));
      if (!response.ok) {
        const error = ProviderErrorSchema.safeParse(payload);
        if (!error.success) throw new LiveConsumerError("invalid-response", "The Intelligence provider returned an invalid error.");
        const code = response.status === 401 || response.status === 403 ? "authentication-failed"
          : response.status === 429 ? "rate-limited"
            : response.status >= 500 ? "service-unavailable" : "invalid-response";
        throw new LiveConsumerError(code, `Intelligence provider request failed: ${error.data.error.code}.`);
      }
      return payload;
    } catch (error) {
      if (error instanceof LiveConsumerError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LiveConsumerError("timeout", "The Intelligence provider request timed out.");
      throw new LiveConsumerError("service-unavailable", "The Intelligence provider request failed.");
    } finally {
      clearTimeout(timer);
    }
  }
}
