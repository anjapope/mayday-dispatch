import { z } from "zod";

export const GatewayErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "ORIGIN_CONFLICT",
  "STALE_VERSION",
  "IDEMPOTENCY_CONFLICT",
  "PERSISTENCE_FAILURE",
  "EVIDENCE_NOT_REGISTERED",
  "AUDIT_FAILURE",
  "INVALID_TRANSITION",
  "EVIDENCE_POLICY_VIOLATION",
  "EDITORIAL_LOCK",
  "INTERNAL_ERROR",
]);

export type GatewayErrorCode = z.infer<typeof GatewayErrorCodeSchema>;

const errorStatuses: Record<GatewayErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ORIGIN_CONFLICT: 409,
  STALE_VERSION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PERSISTENCE_FAILURE: 503,
  EVIDENCE_NOT_REGISTERED: 422,
  AUDIT_FAILURE: 503,
  INVALID_TRANSITION: 409,
  EVIDENCE_POLICY_VIOLATION: 422,
  EDITORIAL_LOCK: 409,
  INTERNAL_ERROR: 500,
};

export type GatewayErrorDetails = Readonly<Record<string, unknown>>;

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly status: number;
  readonly details?: GatewayErrorDetails;

  constructor(code: GatewayErrorCode, message: string, details?: GatewayErrorDetails) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = errorStatuses[code];
    this.details = details;
  }
}

export function gatewayValidationError(error: z.ZodError): GatewayError {
  return new GatewayError("VALIDATION_FAILED", "The request body failed validation.", {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) {
    return error;
  }
  if (error instanceof z.ZodError) {
    return gatewayValidationError(error);
  }

  return new GatewayError("INTERNAL_ERROR", "The request could not be processed.");
}