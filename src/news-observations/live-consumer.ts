import { z } from "zod";
import {
  NEWS_OBSERVATION_PROTOCOL,
  normalizeNewsObservation,
  normalizeNewsObservations,
  toPublicNewsObservation,
  type PublicNewsObservation,
} from "@/news-observations/contract";
import {
  validateObservationQuery,
  type NewsObservationProvider,
  type ObservationPage,
  type ObservationProviderCapabilities,
  type ObservationProviderStatus,
  type ObservationQuery,
} from "@/news-observations/provider";

export const INTELLIGENCE_CONSUMER_API_VERSION = "mayday.intelligence-consumer/1" as const;

const ConsumerCapabilitiesSchema = z.object({
  serviceId: z.string().min(1).max(200),
  apiVersion: z.literal(INTELLIGENCE_CONSUMER_API_VERSION),
  observationSchemaVersion: z.literal(NEWS_OBSERVATION_PROTOCOL),
  operations: z.object({
    listObservations: z.literal(true),
    getObservation: z.boolean(),
  }).strict(),
  pagination: z.object({
    method: z.literal("cursor"),
    maximumPageSize: z.number().int().min(1).max(100),
  }).strict(),
  filters: z.object({
    topic: z.literal(true),
    temporal: z.literal(true),
  }).strict(),
  references: z.object({
    provenance: z.literal(true),
    source: z.literal(true),
    geography: z.literal(true),
  }).strict(),
  healthStatus: z.literal(true),
  limits: z.object({
    maximumResponseBytes: z.number().int().min(1).max(5_000_000),
  }).strict(),
}).strict();

export type IntelligenceConsumerCapabilities = z.infer<typeof ConsumerCapabilitiesSchema>;

export type IntelligenceConsumerCredentials = {
  bearerToken: string;
  expiresAt: string;
};

export type IntelligenceServiceHealth = {
  status: "ok" | "maintenance" | "unavailable";
};

export interface IntelligenceConsumerTransport {
  discoverCapabilities(credentials: IntelligenceConsumerCredentials): Promise<unknown>;
  getStatus(credentials: IntelligenceConsumerCredentials): Promise<unknown>;
  listObservations(query: ObservationQuery, credentials: IntelligenceConsumerCredentials): Promise<unknown>;
  getObservation?(observationId: string, credentials: IntelligenceConsumerCredentials): Promise<unknown>;
}

export type ConsumerAuditEvent = {
  type: "capability-negotiated" | "capability-rejected" | "authentication-rejected" | "retrieval-failed" | "malformed-observation-rejected" | "rate-limited" | "timeout" | "service-unavailable";
  provider: "live";
  detail?: string;
};

export type LiveConsumerOptions = {
  transport: IntelligenceConsumerTransport;
  credentials: () => IntelligenceConsumerCredentials | undefined;
  maxPageSize?: number;
  maxPagesPerOperation?: number;
  retryCeiling?: number;
  audit?: (event: ConsumerAuditEvent) => void;
};

type LiveErrorCode = "authentication-failed" | "capability-incompatible" | "rate-limited" | "service-unavailable" | "timeout" | "invalid-response";

export class LiveConsumerError extends Error {
  constructor(readonly code: LiveErrorCode, message: string) {
    super(message);
  }
}

function statusFor(code: LiveErrorCode): ObservationProviderStatus {
  const mode = code === "authentication-failed" || code === "capability-incompatible" ? "unavailable" : "degraded";
  return { mode, provider: "live", synthetic: false, detail: code };
}

function errorCode(error: unknown): LiveErrorCode {
  if (error instanceof LiveConsumerError) return error.code;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  return "service-unavailable";
}

function withinResponseLimit(response: unknown, maximumResponseBytes: number): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(response)).byteLength <= maximumResponseBytes;
  } catch {
    return false;
  }
}

export class LiveIntelligenceObservationProvider implements NewsObservationProvider {
  readonly capabilities: ObservationProviderCapabilities = {
    cursorPagination: true,
    temporalFiltering: true,
    topicFiltering: true,
    incrementalUpdates: false,
    liveIntelligence: true,
  };

  status: ObservationProviderStatus = { mode: "unavailable", provider: "live", synthetic: false, detail: "service-unavailable" };
  private capabilitiesDocument?: IntelligenceConsumerCapabilities;
  private readonly maxPageSize: number;
  private readonly maxPagesPerOperation: number;
  private readonly retryCeiling: number;

  constructor(private readonly options: LiveConsumerOptions) {
    this.maxPageSize = options.maxPageSize ?? 20;
    this.maxPagesPerOperation = options.maxPagesPerOperation ?? 5;
    this.retryCeiling = options.retryCeiling ?? 1;
    if (!Number.isInteger(this.maxPageSize) || this.maxPageSize < 1 || this.maxPageSize > 100 || !Number.isInteger(this.maxPagesPerOperation) || this.maxPagesPerOperation < 1 || !Number.isInteger(this.retryCeiling) || this.retryCeiling < 0 || this.retryCeiling > 3) {
      throw new Error("Live consumer bounds are invalid.");
    }
  }

  async list(query: ObservationQuery = {}): Promise<ObservationPage> {
    const capabilities = await this.negotiate();
    const validated = validateObservationQuery(query, Math.min(this.maxPageSize, capabilities.pagination.maximumPageSize));
    return this.withRetries(async (credentials) => {
      const response = await this.options.transport.listObservations(validated, credentials);
      const page = this.parsePage(response, validated.limit, capabilities.limits.maximumResponseBytes);
      this.status = { mode: "live", provider: "live", synthetic: false };
      return page;
    });
  }

  async health(): Promise<IntelligenceServiceHealth> {
    const capabilities = await this.negotiate();
    return this.withRetries(async (credentials) => {
      const response = await this.options.transport.getStatus(credentials);
      if (!withinResponseLimit(response, capabilities.limits.maximumResponseBytes)) {
        throw new LiveConsumerError("invalid-response", "The Intelligence health response exceeded its configured limit.");
      }
      const health = z.object({ status: z.enum(["ok", "maintenance", "unavailable"]) }).strict().safeParse(response);
      if (!health.success) throw new LiveConsumerError("invalid-response", "The Intelligence health response was invalid.");
      this.status = health.data.status === "ok"
        ? { mode: "live", provider: "live", synthetic: false }
        : { mode: "degraded", provider: "live", synthetic: false, detail: "service-unavailable" };
      return health.data;
    });
  }

  async listBounded(query: ObservationQuery = {}): Promise<ObservationPage[]> {
    const pages: ObservationPage[] = [];
    let cursor = query.cursor;
    for (let pageCount = 0; pageCount < this.maxPagesPerOperation; pageCount += 1) {
      const page = await this.list({ ...query, cursor });
      pages.push(page);
      if (!page.nextCursor) return pages;
      cursor = page.nextCursor;
    }
    if (pages.at(-1)?.nextCursor) {
      throw new LiveConsumerError("invalid-response", "The Intelligence retrieval exceeded the configured page limit.");
    }
    return pages;
  }

  async get(observationId: string): Promise<PublicNewsObservation | undefined> {
    const capabilities = await this.negotiate();
    if (!capabilities.operations.getObservation || !this.options.transport.getObservation) return undefined;
    return this.withRetries(async (credentials) => {
      const raw = await this.options.transport.getObservation!(observationId, credentials);
      if (raw === undefined || raw === null) return undefined;
      if (!withinResponseLimit(raw, capabilities.limits.maximumResponseBytes)) {
        throw new LiveConsumerError("invalid-response", "The Intelligence observation response exceeded its configured limit.");
      }
      try {
        const observation = normalizeNewsObservation(raw);
        return observation.publicFeed.eligibility === "eligible" ? toPublicNewsObservation(observation) : undefined;
      } catch {
        this.audit("malformed-observation-rejected");
        throw new LiveConsumerError("invalid-response", "The Intelligence observation response was invalid.");
      }
    });
  }

  private async negotiate(): Promise<IntelligenceConsumerCapabilities> {
    if (this.capabilitiesDocument) return this.capabilitiesDocument;
    return this.withRetries(async (credentials) => {
      let capabilities: IntelligenceConsumerCapabilities;
      try {
        capabilities = ConsumerCapabilitiesSchema.parse(await this.options.transport.discoverCapabilities(credentials));
      } catch (error) {
        if (error instanceof LiveConsumerError) throw error;
        this.audit("capability-rejected");
        throw new LiveConsumerError("capability-incompatible", "The Intelligence capability document is incompatible.");
      }
      this.capabilitiesDocument = capabilities;
      this.status = { mode: "live", provider: "live", synthetic: false };
      this.audit("capability-negotiated", capabilities.serviceId);
      return capabilities;
    });
  }

  private parsePage(response: unknown, requestedLimit: number, maximumResponseBytes: number): ObservationPage {
    if (!withinResponseLimit(response, maximumResponseBytes)) {
      throw new LiveConsumerError("invalid-response", "The Intelligence observation page exceeded its configured limit.");
    }
    const parsed = z.object({
      observations: z.array(z.unknown()).max(requestedLimit),
      nextCursor: z.string().min(1).max(500).regex(/^[A-Za-z0-9._:-]+$/).optional(),
    }).strict().safeParse(response);
    if (!parsed.success) throw new LiveConsumerError("invalid-response", "The Intelligence observation page was invalid or oversized.");
    try {
      const normalized = normalizeNewsObservations(parsed.data.observations);
      return {
        observations: normalized
          .filter((observation) => observation.publicFeed.eligibility === "eligible")
          .map(toPublicNewsObservation),
        nextCursor: parsed.data.nextCursor,
        provider: "live",
        synthetic: false,
        mode: "live",
      };
    } catch {
      this.audit("malformed-observation-rejected");
      throw new LiveConsumerError("invalid-response", "The Intelligence observation page contained an invalid observation.");
    }

  }

  private async withRetries<T>(action: (credentials: IntelligenceConsumerCredentials) => Promise<T>): Promise<T> {
    const credentials = this.options.credentials();
    if (!credentials?.bearerToken || Number.isNaN(Date.parse(credentials.expiresAt)) || Date.parse(credentials.expiresAt) <= Date.now()) {
      this.status = statusFor("authentication-failed");
      this.audit("authentication-rejected");
      throw new LiveConsumerError("authentication-failed", "Live Intelligence credentials are missing or expired.");
    }
    for (let attempt = 0; attempt <= this.retryCeiling; attempt += 1) {
      try {
        return await action(credentials);
      } catch (error) {
        const code = errorCode(error);
        this.status = statusFor(code);
        this.audit(code === "timeout" ? "timeout" : code === "rate-limited" ? "rate-limited" : code === "service-unavailable" ? "service-unavailable" : "retrieval-failed");
        if (attempt === this.retryCeiling || code === "authentication-failed" || code === "capability-incompatible" || code === "invalid-response") throw error;
      }
    }
    throw new LiveConsumerError("service-unavailable", "Live Intelligence retrieval failed.");
  }

  private audit(type: ConsumerAuditEvent["type"], detail?: string): void {
    this.options.audit?.({ type, provider: "live", detail });
  }
}
