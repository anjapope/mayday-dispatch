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
  EvidenceDetailResponseSchema,
  EvidenceSearchResponseSchema,
  type EvidenceDetailResponse,
  type EvidenceSearchQuery,
  type EvidenceSearchResponse,
} from "@/application/evidence-gateway/dto";
import {
  DispatchHttpTransport,
  type DispatchMachineCredential,
  type DispatchRequestOptions,
} from "@/integrations/dispatch-client/transport";

export class ResearchStudioDispatchError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(`Dispatch request failed with ${code}.`);
    this.name = "ResearchStudioDispatchError";
  }
}

export class ResearchStudioVersionConflictError extends ResearchStudioDispatchError {
  constructor(status: number, correlationId: string) {
    super("STALE_VERSION", status, correlationId);
    this.name = "ResearchStudioVersionConflictError";
  }
}

export class ResearchStudioOriginConflictError extends ResearchStudioDispatchError {
  constructor(status: number, correlationId: string) {
    super("ORIGIN_CONFLICT", status, correlationId);
    this.name = "ResearchStudioOriginConflictError";
  }
}

export class ResearchStudioAuthorizationError extends ResearchStudioDispatchError {
  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", status: number, correlationId: string) {
    super(code, status, correlationId);
    this.name = "ResearchStudioAuthorizationError";
  }
}

export class ResearchStudioEditorialLockError extends ResearchStudioDispatchError {
  constructor(
    status: number,
    correlationId: string,
    readonly publicationId: string,
    readonly currentVersion: number,
    readonly currentLifecycleState: string,
  ) {
    super("EDITORIAL_LOCK", status, correlationId);
    this.name = "ResearchStudioEditorialLockError";
  }
}

export type ResearchStudioMachineCredential = DispatchMachineCredential;
export type ResearchStudioRequestOptions = DispatchRequestOptions;

export type ResearchStudioClientOptions = {
  baseUrl: string;
  applicationName: string;
  credential: ResearchStudioMachineCredential;
  fetch?: typeof fetch;
};

export class ResearchStudioDispatchClient {
  private readonly transport: DispatchHttpTransport;

  constructor(private readonly options: ResearchStudioClientOptions) {
    this.transport = new DispatchHttpTransport(options);
  }

  createDraft(
    request: CreateDraftPublicationRequest,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    return this.send("/api/publications", "POST", request, options);
  }

  updateDraft(
    publicationId: string,
    request: UpdatePublicationRequest,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}`, "PATCH", request, options);
  }

  retrieveLinkedPublication(
    publicationId: string,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}`, "GET", undefined, options);
  }

  async retrieveCurrentVersion(
    publicationId: string,
    options: ResearchStudioRequestOptions = {},
  ): Promise<number> {
    const response = await this.retrieveLinkedPublication(publicationId, options);
    return response.originLink.version;
  }

  attachEvidence(
    publicationId: string,
    request: AttachEvidenceRequest,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}/evidence`, "POST", request, options);
  }

  requestLifecycle(
    publicationId: string,
    request: TransitionPublicationRequest,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}/transition`, "POST", request, options);
  }

  searchEvidence(query: Partial<EvidenceSearchQuery>, options: ResearchStudioRequestOptions = {}): Promise<EvidenceSearchResponse> {
    return this.sendEvidence(`/api/evidence?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`, options, EvidenceSearchResponseSchema);
  }

  getEvidence(evidenceId: string, options: ResearchStudioRequestOptions = {}): Promise<EvidenceDetailResponse> {
    return this.sendEvidence(`/api/evidence/${evidenceId}`, options, EvidenceDetailResponseSchema);
  }

  private async send(
    path: string,
    method: string,
    body?: unknown,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    const { response, json } = await this.transport.send(path, method, body, options);
    if (!response.ok) {
      const error = GatewayErrorResponseSchema.parse(json).error;
      if (error.code === "STALE_VERSION") {
        throw new ResearchStudioVersionConflictError(response.status, error.correlationId);
      }
      if (error.code === "ORIGIN_CONFLICT") {
        throw new ResearchStudioOriginConflictError(response.status, error.correlationId);
      }
      if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
        throw new ResearchStudioAuthorizationError(error.code, response.status, error.correlationId);
      }
      if (error.code === "EDITORIAL_LOCK") {
        const details = error.details;
        if (
          typeof details?.publicationId === "string" &&
          typeof details.currentVersion === "number" &&
          typeof details.currentLifecycleState === "string"
        ) {
          throw new ResearchStudioEditorialLockError(
            response.status,
            error.correlationId,
            details.publicationId,
            details.currentVersion,
            details.currentLifecycleState,
          );
        }
      }
      throw new ResearchStudioDispatchError(
        error.code,
        response.status,
        error.correlationId,
      );
    }
    return GatewayPublicationResponseSchema.parse(json);
  }

  private async sendEvidence<T>(path: string, options: ResearchStudioRequestOptions, schema: { parse(value: unknown): T }): Promise<T> {
    const { response, json } = await this.transport.send(path, "GET", undefined, options);
    if (!response.ok) {
      const error = GatewayErrorResponseSchema.parse(json).error;
      if (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN") {
        throw new ResearchStudioAuthorizationError(error.code, response.status, error.correlationId);
      }
      throw new ResearchStudioDispatchError(error.code, response.status, error.correlationId);
    }
    return schema.parse(json);
  }

}
