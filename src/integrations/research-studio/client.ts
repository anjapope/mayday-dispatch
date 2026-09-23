import {
  GatewayErrorResponseSchema,
  GatewayPublicationResponseSchema,
  type AttachEvidenceRequest,
  type CreateDraftPublicationRequest,
  type GatewayPublicationResponse,
  type TransitionPublicationRequest,
  type UpdatePublicationRequest,
} from "@/application/publication-gateway/dto";

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

export type ResearchStudioClientOptions = {
  baseUrl: string;
  applicationName?: string;
  subjectId?: string;
  fetch?: typeof fetch;
};

export class ResearchStudioDispatchClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly headers: HeadersInit;

  constructor(private readonly options: ResearchStudioClientOptions) {
    this.fetchImplementation = options.fetch ?? fetch;
    this.headers = {
      "content-type": "application/json",
      "x-mayday-role": "external-application",
      "x-mayday-application": options.applicationName ?? "Research Studio",
      "x-mayday-subject": options.subjectId ?? "research-studio-service",
    };
  }

  createDraft(
    request: CreateDraftPublicationRequest,
    idempotencyKey?: string,
  ): Promise<GatewayPublicationResponse> {
    return this.send("/api/publications", "POST", request, idempotencyKey);
  }

  updateDraft(
    publicationId: string,
    request: UpdatePublicationRequest,
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}`, "PATCH", request);
  }

  retrieveLinkedPublication(publicationId: string): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}`, "GET");
  }

  attachEvidence(
    publicationId: string,
    request: AttachEvidenceRequest,
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}/evidence`, "POST", request);
  }

  requestLifecycle(
    publicationId: string,
    request: TransitionPublicationRequest,
  ): Promise<GatewayPublicationResponse> {
    return this.send(`/api/publications/${publicationId}/transition`, "POST", request);
  }

  private async send(
    path: string,
    method: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<GatewayPublicationResponse> {
    const response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
      method,
      headers: {
        ...this.headers,
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const error = GatewayErrorResponseSchema.parse(json).error;
      if (error.code === "STALE_VERSION") {
        throw new ResearchStudioVersionConflictError(response.status, error.correlationId);
      }
      throw new ResearchStudioDispatchError(
        error.code,
        response.status,
        error.correlationId,
      );
    }
    return GatewayPublicationResponseSchema.parse(json);
  }
}
