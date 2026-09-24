import { createHash, createHmac, randomUUID } from "node:crypto";
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

export type ResearchStudioMachineCredential =
  | { bearerToken: string; hmacSecret?: never }
  | { hmacSecret: string; bearerToken?: never };

export type ResearchStudioRequestOptions = {
  correlationId?: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type ResearchStudioClientOptions = {
  baseUrl: string;
  applicationName: string;
  credential: ResearchStudioMachineCredential;
  fetch?: typeof fetch;
};

export class ResearchStudioDispatchClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ResearchStudioClientOptions) {
    this.fetchImplementation = options.fetch ?? fetch;
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

  private async send(
    path: string,
    method: string,
    body?: unknown,
    options: ResearchStudioRequestOptions = {},
  ): Promise<GatewayPublicationResponse> {
    const serializedBody = body === undefined ? "" : JSON.stringify(body);
    const requestId = options.requestId ?? randomUUID();
    const headers = this.authenticationHeaders(method, path, serializedBody);
    const response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
      method,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-correlation-id": options.correlationId ?? requestId,
        ...headers,
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : serializedBody,
    });
    const json: unknown = await response.json();
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

  private authenticationHeaders(
    method: string,
    path: string,
    body: string,
  ): Record<string, string> {
    if ("bearerToken" in this.options.credential) {
      return { authorization: `Bearer ${this.options.credential.bearerToken}` };
    }

    const timestamp = Date.now().toString();
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
    const signature = createHmac("sha256", this.options.credential.hmacSecret)
      .update(payload, "utf8")
      .digest("hex");
    return {
      "x-mayday-app": this.options.applicationName,
      "x-mayday-timestamp": timestamp,
      "x-mayday-signature": signature,
    };
  }
}
