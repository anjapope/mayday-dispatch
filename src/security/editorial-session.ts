import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { GatewayError } from "@/application/publication-gateway/errors";
import {
  resolveConfiguredCredentialActor,
  resolveConfiguredEditorialCredentialFingerprint,
} from "@/security/app-authentication";
import type { GatewayActor } from "@/application/publication-gateway/authorization";

export const EDITORIAL_SESSION_COOKIE = "mayday-editorial-session";
export const EDITORIAL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const SessionPayloadSchema = z.object({
  subjectId: z.string().min(1),
  applicationName: z.string().min(1),
  credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
}).strict();

function sessionSecret(): string {
  const secretFile = process.env.MAYDAY_SESSION_SECRET_FILE;
  const configuredSecret = process.env.MAYDAY_SESSION_SECRET;
  if (secretFile && configuredSecret) {
    throw new GatewayError("INTERNAL_ERROR", "Configure only one editorial session key source.");
  }
  let secret = configuredSecret;
  if (secretFile) {
    try {
      secret = readFileSync(secretFile, "utf8").trimEnd();
    } catch {
      throw new GatewayError("INTERNAL_ERROR", "The editorial session signing key could not be loaded.");
    }
  }
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new GatewayError(
      "INTERNAL_ERROR",
      "The editorial session signing key is not configured securely.",
    );
  }
  return secret;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", sessionSecret()).update(payload, "utf8").digest();
}

export function createEditorialSession(actor: GatewayActor, now = Date.now()): string {
  if (!actor.originatingApplication) {
    throw new GatewayError("UNAUTHORIZED", "An application-backed editorial account is required.");
  }
  const credentialFingerprint = resolveConfiguredEditorialCredentialFingerprint(
    actor.subjectId,
    actor.originatingApplication,
  );
  if (!credentialFingerprint) {
    throw new GatewayError("UNAUTHORIZED", "The configured editorial account could not be verified.");
  }
  const payload = Buffer.from(JSON.stringify({
    subjectId: actor.subjectId,
    applicationName: actor.originatingApplication,
    credentialFingerprint,
    expiresAt: now + EDITORIAL_SESSION_MAX_AGE_SECONDS * 1000,
  })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}

function cookieValue(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  let found: string | undefined;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === EDITORIAL_SESSION_COOKIE) {
      if (found !== undefined) {
        throw new GatewayError("UNAUTHORIZED", "The editorial session cookie is ambiguous.");
      }
      found = cookie.slice(separator + 1).trim();
    }
  }
  return found;
}

export function resolveEditorialSessionActor(request: Request): GatewayActor | undefined {
  const token = cookieValue(request);
  if (!token) return undefined;
  if (token.length > 2048) {
    throw new GatewayError("UNAUTHORIZED", "The editorial session is invalid.");
  }

  const [payload, encodedSignature, extra] = token.split(".");
  if (
    !payload ||
    !encodedSignature ||
    extra !== undefined ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature) ||
    Buffer.from(payload, "base64url").toString("base64url") !== payload
  ) {
    throw new GatewayError("UNAUTHORIZED", "The editorial session is invalid.");
  }

  const candidate = Buffer.from(encodedSignature, "base64url");
  if (candidate.toString("base64url") !== encodedSignature) {
    throw new GatewayError("UNAUTHORIZED", "The editorial session is invalid.");
  }
  const expected = signature(payload);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw new GatewayError("UNAUTHORIZED", "The editorial session is invalid.");
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new GatewayError("UNAUTHORIZED", "The editorial session is invalid.");
  }
  const parsed = SessionPayloadSchema.safeParse(parsedPayload);
  if (!parsed.success || parsed.data.expiresAt <= Date.now()) {
    throw new GatewayError("UNAUTHORIZED", "The editorial session has expired.");
  }

  const currentFingerprint = resolveConfiguredEditorialCredentialFingerprint(
    parsed.data.subjectId,
    parsed.data.applicationName,
  );
  if (
    !currentFingerprint ||
    !timingSafeEqual(
      Buffer.from(parsed.data.credentialFingerprint, "hex"),
      Buffer.from(currentFingerprint, "hex"),
    )
  ) {
    throw new GatewayError("UNAUTHORIZED", "The editorial account credentials have changed.");
  }

  const actor = resolveConfiguredCredentialActor(
    parsed.data.subjectId,
    parsed.data.applicationName,
  );
  if (
    !actor ||
    actor.roles.includes("external-application") ||
    !actor.roles.some((role) => ["editor", "publisher", "admin", "operator"].includes(role))
  ) {
    throw new GatewayError("UNAUTHORIZED", "The editorial account is no longer authorized.");
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    let requestOrigin: string;
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      throw new GatewayError("FORBIDDEN", "The editorial request origin could not be verified.");
    }
    if (!origin || origin !== requestOrigin) {
      throw new GatewayError("FORBIDDEN", "Cross-origin editorial requests are not allowed.");
    }
  }
  return actor;
}

export function editorialSessionCookie(token: string, secure: boolean): string {
  return [
    `${EDITORIAL_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${EDITORIAL_SESSION_MAX_AGE_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function clearEditorialSessionCookie(secure: boolean): string {
  return [
    `${EDITORIAL_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
