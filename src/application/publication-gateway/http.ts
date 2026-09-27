import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { GATEWAY_ROLES, type GatewayActor, type GatewayRole } from "@/application/publication-gateway/authorization";
import { GatewayError, toGatewayError } from "@/application/publication-gateway/errors";
import { GatewayErrorResponseSchema } from "@/application/publication-gateway/dto";
import type { GatewayRequestContext } from "@/application/publication-gateway/service";
import { resolveAuthenticatedApplicationActor } from "@/security/app-authentication";
import { resolveEditorialSessionActor } from "@/security/editorial-session";
import { logOperationalEvent } from "@/observability/operational-log";

export const MAX_API_REQUEST_BYTES = 1024 * 1024;
const requestBodyCache = new WeakMap<Request, Promise<string>>();

function parseDevRoles(headers: Headers): GatewayRole[] {
  const roleHeader = headers.get("x-mayday-roles") ?? headers.get("x-mayday-role");
  if (!roleHeader) {
    return [];
  }

  return roleHeader
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is GatewayRole => GATEWAY_ROLES.includes(role as GatewayRole));
}

/**
 * Development-only header adapter. It is never trusted in a
 * production-shaped path; it is gated behind `MAYDAY_TRUST_DEV_HEADERS` and
 * additionally disabled outright when `NODE_ENV === "production"` unless
 * that flag is explicitly set. Prefer `MAYDAY_APPLICATION_CREDENTIALS`
 * (see `docs/service-authentication.md`) for any deployment.
 */
function devHeaderActor(request: Request): GatewayActor | undefined {
  const trusted = process.env.MAYDAY_TRUST_DEV_HEADERS === "true";
  const isTestEnvironment = process.env.NODE_ENV === "test";
  if (!trusted && !isTestEnvironment) {
    // Dev headers are never active by accident: they require an explicit
    // opt-in outside of the automated test environment, and are always
    // ignored in a production-shaped path.
    return undefined;
  }
  const roles = parseDevRoles(request.headers);
  if (roles.length === 0) {
    return undefined;
  }

  return {
    subjectId: request.headers.get("x-mayday-subject") ?? "anonymous",
    roles,
    originatingApplication: request.headers.get("x-mayday-application") ?? undefined,
  };
}

function requestBodyText(request: Request): Promise<string> {
  const cached = requestBodyCache.get(request);
  if (cached) return cached;
  const body = readBoundedBody(request);
  requestBodyCache.set(request, body);
  return body;
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new GatewayError("VALIDATION_FAILED", "The request content length is invalid.");
    }
    if (length > MAX_API_REQUEST_BYTES) {
      throw new GatewayError("REQUEST_TOO_LARGE", "API request bodies may not exceed 1 MiB.");
    }
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_API_REQUEST_BYTES) {
      await reader.cancel();
      throw new GatewayError("REQUEST_TOO_LARGE", "API request bodies may not exceed 1 MiB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new GatewayError("VALIDATION_FAILED", "The request body must use valid UTF-8 encoding.");
  }
}

/**
 * Resolves the calling actor's identity. The production-shaped path is an
 * authenticated application credential (`resolveAuthenticatedApplicationActor`);
 * if a credential is presented but invalid, this rejects the request rather
 * than falling back. Only when no credential is presented at all does this
 * fall back to the development header adapter, which is itself gated. Roles
 * always come from server-side configuration, never from client headers, in
 * the credentialed path.
 *
 * Must be awaited before the request body is read elsewhere, since it clones
 * the body internally to support signed-request verification.
 */
export async function actorFromRequest(request: Request): Promise<GatewayActor | undefined> {
  const rawBody = await requestBodyText(request);
  const applicationActor = resolveAuthenticatedApplicationActor(request, rawBody);
  if (applicationActor) {
    return { ...applicationActor, authenticationMethod: "application-credential" };
  }
  const sessionActor = resolveEditorialSessionActor(request);
  if (sessionActor) {
    return { ...sessionActor, authenticationMethod: "editorial-session" };
  }
  const developmentActor = devHeaderActor(request);
  return developmentActor
    ? { ...developmentActor, authenticationMethod: "development" }
    : undefined;
}

export function requestContextFromRequest(request: Request): GatewayRequestContext {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  return {
    requestId,
    correlationId:
      request.headers.get("x-correlation-id")?.trim() || requestId,
    idempotencyKey: request.headers.get("idempotency-key")?.trim() || undefined,
  };
}

export function publicReaderActor(): GatewayActor {
  return {
    subjectId: "public",
    roles: ["public-reader"],
  };
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await requestBodyText(request));
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError("VALIDATION_FAILED", "The request body must be valid JSON.");
  }
}

export function jsonResponse<T>(
  body: T,
  status = 200,
  context?: GatewayRequestContext,
): NextResponse<T> {
  return NextResponse.json(body, {
    status,
    headers: context
      ? {
          "x-request-id": context.requestId,
          "x-correlation-id": context.correlationId,
        }
      : undefined,
  });
}

export function gatewayErrorResponse(
  error: unknown,
  context: GatewayRequestContext = {
    requestId: "unavailable",
    correlationId: "unavailable",
  },
): NextResponse {
  const gatewayError =
    error instanceof GatewayError ? error : toGatewayError(error);
  const body = GatewayErrorResponseSchema.parse({
    error: {
      code: gatewayError.code,
      message: gatewayError.message,
      correlationId: context.correlationId,
      details: gatewayError.details,
    },
  });
  if (gatewayError.code === "UNAUTHORIZED" || gatewayError.code === "FORBIDDEN") {
    logOperationalEvent("authentication.rejected", context, gatewayError.code);
  }

  return NextResponse.json(body, {
    status: gatewayError.status,
    headers: {
      "x-request-id": context.requestId,
      "x-correlation-id": context.correlationId,
    },
  });
}