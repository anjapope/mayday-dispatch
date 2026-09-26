import {
  GatewayErrorResponseSchema,
} from "@/application/publication-gateway/dto";
import {
  EvidenceGatewayResponseSchema,
  type EvidenceGatewayResponse,
} from "@/application/evidence-gateway/dto";
import {
  DispatchHttpTransport,
  type DispatchMachineCredential,
  type DispatchRequestOptions,
} from "@/integrations/dispatch-client/transport";
import {
  Mayday3EvidenceRegistrationSchema,
  Mayday3EvidenceUpdateSchema,
  type Mayday3EvidenceRegistration,
  type Mayday3EvidenceUpdate,
} from "@/integrations/mayday3/dto";

export class Mayday3DispatchError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly correlationId: string,
  ) {
    super(`Dispatch evidence request failed with ${code}.`);
    this.name = "Mayday3DispatchError";
  }
}

export class Mayday3EvidenceVersionConflictError extends Mayday3DispatchError {
  constructor(status: number, correlationId: string) {
    super("STALE_VERSION", status, correlationId);
    this.name = "Mayday3EvidenceVersionConflictError";
  }
}

export type Mayday3ClientOptions = {
  baseUrl: string;
  credential: DispatchMachineCredential;
  fetch?: typeof fetch;
};

export type Mayday3RequestOptions = DispatchRequestOptions;

export class Mayday3EvidenceClient {
  private readonly transport: DispatchHttpTransport;

  constructor(options: Mayday3ClientOptions) {
    this.transport = new DispatchHttpTransport({
      ...options,
      applicationName: "mayday3",
    });
  }

  registerEvidence(
    input: Mayday3EvidenceRegistration,
    options: Mayday3RequestOptions = {},
  ): Promise<EvidenceGatewayResponse> {
    return this.send("/api/evidence", "POST", Mayday3EvidenceRegistrationSchema.parse(input), options);
  }

  getEvidence(
    evidenceId: string,
    options: Mayday3RequestOptions = {},
  ): Promise<EvidenceGatewayResponse> {
    return this.send(`/api/evidence/${evidenceId}`, "GET", undefined, options);
  }

  updateEvidenceProcessingState(
    evidenceId: string,
    input: Mayday3EvidenceUpdate,
    options: Mayday3RequestOptions = {},
  ): Promise<EvidenceGatewayResponse> {
    return this.send(
      `/api/evidence/${evidenceId}`,
      "PATCH",
      Mayday3EvidenceUpdateSchema.parse(input),
      options,
    );
  }

  private async send(
    path: string,
    method: string,
    body: unknown,
    options: Mayday3RequestOptions,
  ): Promise<EvidenceGatewayResponse> {
    const { response, json } = await this.transport.send(path, method, body, options);
    if (!response.ok) {
      const error = GatewayErrorResponseSchema.parse(json).error;
      if (error.code === "STALE_VERSION") {
        throw new Mayday3EvidenceVersionConflictError(response.status, error.correlationId);
      }
      throw new Mayday3DispatchError(error.code, response.status, error.correlationId);
    }
    return EvidenceGatewayResponseSchema.parse(json);
  }
}
