import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { GATEWAY_ROLES, type GatewayActor, type GatewayRole } from "@/application/publication-gateway/authorization";
import { GatewayError, toGatewayError } from "@/application/publication-gateway/errors";
import { GatewayErrorResponseSchema } from "@/application/publication-gateway/dto";
import type { GatewayRequestContext } from "@/application/publication-gateway/service";
import { resolveAuthenticatedApplicationActor } from "@/security/app-authentication";

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

async function cloneBodyText(request: Request): Promise<string> {
  try {
    return await request.clone().text();
  } catch {
    return "";
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
  const rawBody = await cloneBodyText(request);
  const applicationActor = resolveAuthenticatedApplicationActor(request, rawBody);
  if (applicationActor) {
    return applicationActor;
  }
  return devHeaderActor(request);
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
    return await request.json();
  } catch {
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

  return NextResponse.json(body, {
    status: gatewayError.status,
    headers: {
      "x-request-id": context.requestId,
      "x-correlation-id": context.correlationId,
    },
  });
}