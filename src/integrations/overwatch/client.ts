import {
  GatewayErrorResponseSchema,
  GatewayPublicationResponseSchema,
  type AttachEvidenceRequest,
  type CreateDraftPublicationRequest,
  type GatewayPublicationResponse,
  type TransitionPublicationRequest,
  type UpdatePublicationRequest,
} from "@/application/publication-gateway/dto";
import {
  DispatchHttpTransport,
  type DispatchMachineCredential,
  type DispatchRequestOptions,
} from "@/integrations/dispatch-client/transport";
import {
  OverwatchPublicationInputSchema,
  type OverwatchPublicationInput,
} from "@/integrations/overwatch/dto";

export class OverwatchDispatchError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly correlationId: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`Dispatch request failed with ${code}.`);
    this.name = "OverwatchDispatchError";
  }
}

export class OverwatchVersionConflictError extends OverwatchDispatchError {
  constructor(status: number, correlationId: string) {
    super("STALE_VERSION", status, correlationId);
    this.name = "OverwatchVersionConflictError";
  }
}

export class OverwatchOriginConflictError extends OverwatchDispatchError {
  constructor(status: number, correlationId: string) {
    super("ORIGIN_CONFLICT", status, correlationId);
    this.name = "OverwatchOriginConflictError";
  }
}

export class OverwatchAuthorizationError extends OverwatchDispatchError {}

export class OverwatchEditorialLockError extends OverwatchDispatchError {
  constructor(status: number, correlationId: string, readonly publicationId: string, readonly currentVersion: number, readonly currentLifecycleState: string) {
    super("EDITORIAL_LOCK", status, correlationId);
    this.name = "OverwatchEditorialLockError";
  }
}

export type OverwatchClientOptions = {
  baseUrl: string;
  applicationName?: string;
  credential: DispatchMachineCredential;
  fetch?: typeof fetch;
};

export type OverwatchRequestOptions = DispatchRequestOptions;

export class OverwatchDispatchClient {
  private readonly transport: DispatchHttpTransport;

  constructor(private readonly options: OverwatchClientOptions) {
    this.transport = new DispatchHttpTransport({
      baseUrl: options.baseUrl,
      applicationName: options.applicationName ?? "overwatch",
      credential: options.credential,
      fetch: options.fetch,
    });
  }

  submit(input: OverwatchPublicationInput, options: OverwatchRequestOptions = {}): Promise<GatewayPublicationResponse> {
    const parsed = OverwatchPublicationInputSchema.parse(input);
    const request: CreateDraftPublicationRequest = {
      slug: parsed.slug,
      type: parsed.publicationType,
      title: parsed.title,
      excerpt: parsed.summary,
      body: parsed.body,
      readingTimeMinutes: parsed.readingTimeMinutes,
      tags: parsed.tags,
      visibility: parsed.visibility,
      sources: parsed.citations,
      origin: {
        kind: "open-source-intelligence",
        label: "Mayday Overwatch",
        url: parsed.citations.find((citation) => citation.url)?.url,
        originatingApplication: "overwatch",
        originatingProject: parsed.projectId,
        stableObjectId: parsed.overwatchObjectId,
      },
      createdBy: "Overwatch",
      verificationStatus: "unverified",
      evidenceIds: parsed.evidenceIds,
      expectedVersion: parsed.expectedVersion,
      extensions: {
        overwatch: {
          assessment: parsed.assessment,
          seriesId: parsed.seriesId,
          previousPublicationId: parsed.previousPublicationId,
          reportingPeriod: parsed.reportingPeriod,
          methodology: parsed.methodology,
          provenanceNote: parsed.provenanceNote,
        },
      },
    };
    return this.send("/api/publications", "POST", request, {
      ...options,
      idempotencyKey: options.idempotencyKey ?? parsed.idempotencyKey,
    });
  }

  update(publicationId: string, input: OverwatchPublicationInput, options: OverwatchRequestOptions = {}) {
    const parsed = OverwatchPublicationInputSchema.parse(input);
    const request: UpdatePublicationRequest = {
      slug: parsed.slug,
      type: parsed.publicationType,
      title: parsed.title,
      excerpt: parsed.summary,
      body: parsed.body,
      readingTimeMinutes: parsed.readingTimeMinutes,
      tags: parsed.tags,
      visibility: parsed.visibility,
      sources: parsed.citations,
      expectedVersion: parsed.expectedVersion ?? 1,
      revisionSummary: "Overwatch synchronization.",
      extensions: {
        overwatch: {
          assessment: parsed.assessment,
          seriesId: parsed.seriesId,
          previousPublicationId: parsed.previousPublicationId,
          reportingPeriod: parsed.reportingPeriod,
          methodology: parsed.methodology,
          provenanceNote: parsed.provenanceNote,
        },
      },
    };
    return this.send(`/api/publications/${publicationId}`, "PATCH", request, options);
  }

  retrieve(publicationId: string, options: OverwatchRequestOptions = {}) {
    return this.send(`/api/publications/${publicationId}`, "GET", undefined, options);
  }

  retrieveCurrentVersion(publicationId: string, options: OverwatchRequestOptions = {}) {
    return this.retrieve(publicationId, options).then((response) => response.originLink.version);
  }

  attachEvidence(publicationId: string, request: AttachEvidenceRequest, options: OverwatchRequestOptions = {}) {
    return this.send(`/api/publications/${publicationId}/evidence`, "POST", request, options);
  }

  requestLifecycle(publicationId: string, request: TransitionPublicationRequest, options: OverwatchRequestOptions = {}) {
    return this.send(`/api/publications/${publicationId}/transition`, "POST", request, options);
  }

  private async send(path: string, method: string, body: unknown, options: OverwatchRequestOptions): Promise<GatewayPublicationResponse> {
    const { response, json } = await this.transport.send(path, method, body, options);
    if (!response.ok) {
      const error = GatewayErrorResponseSchema.parse(json).error;
      if (error.code === "STALE_VERSION") throw new OverwatchVersionConflictError(response.status, error.correlationId);
      if (error.code === "ORIGIN_CONFLICT") throw new OverwatchOriginConflictError(response.status, error.correlationId);
      if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") throw new OverwatchAuthorizationError(error.code, response.status, error.correlationId);
      if (error.code === "EDITORIAL_LOCK" && typeof error.details?.publicationId === "string" && typeof error.details.currentVersion === "number" && typeof error.details.currentLifecycleState === "string") {
        throw new OverwatchEditorialLockError(response.status, error.correlationId, error.details.publicationId, error.details.currentVersion, error.details.currentLifecycleState);
      }
      throw new OverwatchDispatchError(error.code, response.status, error.correlationId, error.details);
    }
    return GatewayPublicationResponseSchema.parse(json);
  }

}
