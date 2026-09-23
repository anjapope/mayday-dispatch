import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { GATEWAY_ROLES, type GatewayActor, type GatewayRole } from "@/application/publication-gateway/authorization";
import { GatewayError } from "@/application/publication-gateway/errors";

/**
 * Machine-to-machine authentication for the Dispatch gateway.
 *
 * This module resolves *who* is calling (an authenticated application
 * identity) from server-configured credentials. It never decides *what*
 * that identity may do; `PublicationAuthorizationPolicy` remains solely
 * responsible for authorization. Roles are only ever taken from the
 * matched server-side credential record, never from client-supplied
 * headers, so a caller cannot escalate privileges by sending arbitrary
 * `x-mayday-role` values.
 *
 * Two credential shapes are supported, configured through the
 * `MAYDAY_APPLICATION_CREDENTIALS` environment variable (a JSON array):
 *
 * - Bearer application token: the credential stores a SHA-256 `tokenHash`.
 *   The caller sends `Authorization: Bearer <token>`; Dispatch hashes the
 *   presented token and compares it, in constant time, to the configured
 *   hash. The plaintext token is never stored by Dispatch.
 * - Signed request: the credential stores an `hmacSecret` shared
 *   out-of-band with the calling application. The caller signs
 *   `METHOD\npath\ntimestamp\nsha256(body)` with HMAC-SHA256 and sends the
 *   result as `x-mayday-signature`, alongside `x-mayday-app` and
 *   `x-mayday-timestamp`. Requests outside a five minute window are
 *   rejected to bound replay risk.
 *
 * Neither scheme is enabled unless `MAYDAY_APPLICATION_CREDENTIALS` is
 * configured. No credential material is committed to source control; see
 * `docs/service-authentication.md`.
 */

const GatewayRoleSchema = z.enum(
  GATEWAY_ROLES as [GatewayRole, ...GatewayRole[]],
);

const ApplicationCredentialSchema = z
  .object({
    applicationName: z.string().trim().min(1),
    subjectId: z.string().trim().min(1),
    roles: z.array(GatewayRoleSchema).min(1),
    tokenHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "tokenHash must be a lowercase or uppercase SHA-256 hex digest.")
      .optional(),
    hmacSecret: z.string().min(16).optional(),
  })
  .strict()
  .refine((credential) => Boolean(credential.tokenHash || credential.hmacSecret), {
    message: "Each application credential requires a tokenHash or an hmacSecret.",
  });

export type ApplicationCredential = z.infer<typeof ApplicationCredentialSchema>;

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

function loadCredentials(): ApplicationCredential[] {
  const raw = process.env.MAYDAY_APPLICATION_CREDENTIALS;
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GatewayError(
      "INTERNAL_ERROR",
      "The application credential configuration is not valid JSON.",
    );
  }

  const result = z.array(ApplicationCredentialSchema).safeParse(parsed);
  if (!result.success) {
    throw new GatewayError(
      "INTERNAL_ERROR",
      "The application credential configuration failed validation.",
    );
  }
  return result.data;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timingSafeHexEqual(expectedHex: string, candidateHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  if (expected.length === 0 || expected.length !== candidate.length) {
    return false;
  }
  return timingSafeEqual(expected, candidate);
}

function toActor(credential: ApplicationCredential): GatewayActor {
  return {
    subjectId: credential.subjectId,
    roles: [...credential.roles],
    originatingApplication: credential.applicationName,
  };
}

function resolveBearerToken(
  request: Request,
  credentials: readonly ApplicationCredential[],
): GatewayActor | undefined {
  const header = request.headers.get("authorization");
  if (!header || !/^bearer\s+/i.test(header)) {
    return undefined;
  }
  const token = header.slice(header.indexOf(" ") + 1).trim();
  if (!token) {
    throw new GatewayError("UNAUTHORIZED", "The application credential is invalid.");
  }

  const presentedHash = sha256Hex(token);
  const match = credentials.find(
    (credential) => credential.tokenHash && timingSafeHexEqual(credential.tokenHash, presentedHash),
  );
  if (!match) {
    throw new GatewayError("UNAUTHORIZED", "The application credential is invalid.");
  }
  return toActor(match);
}

function resolveSignedRequest(
  request: Request,
  rawBody: string,
  credentials: readonly ApplicationCredential[],
): GatewayActor | undefined {
  const signature = request.headers.get("x-mayday-signature");
  if (!signature) {
    return undefined;
  }
  const applicationName = request.headers.get("x-mayday-app");
  const timestamp = request.headers.get("x-mayday-timestamp");
  if (!applicationName || !timestamp) {
    throw new GatewayError(
      "UNAUTHORIZED",
      "A signed request requires x-mayday-app and x-mayday-timestamp.",
    );
  }

  const timestampMs = Number(timestamp);
  const age = Date.now() - timestampMs;
  if (!Number.isFinite(timestampMs) || Math.abs(age) > SIGNATURE_WINDOW_MS) {
    throw new GatewayError("UNAUTHORIZED", "The signed request timestamp is outside the allowed window.");
  }

  const credential = credentials.find(
    (candidate) => candidate.applicationName === applicationName && candidate.hmacSecret,
  );
  if (!credential?.hmacSecret) {
    throw new GatewayError("UNAUTHORIZED", "The application credential is invalid.");
  }

  const url = new URL(request.url);
  const payload = `${request.method}\n${url.pathname}\n${timestamp}\n${sha256Hex(rawBody)}`;
  const expected = createHmac("sha256", credential.hmacSecret).update(payload, "utf8").digest("hex");
  if (!timingSafeHexEqual(expected, signature)) {
    throw new GatewayError("UNAUTHORIZED", "The signed request signature is invalid.");
  }
  return toActor(credential);
}

/**
 * Resolves an authenticated application identity from either a bearer
 * application token or a signed request. Returns `undefined` when the
 * request carries neither credential shape, so callers can fall back to
 * another authentication adapter (for example, the development header
 * adapter). Throws `GatewayError("UNAUTHORIZED", ...)` when a credential is
 * present but does not verify, so invalid credentials are always rejected
 * rather than silently downgraded.
 */
export function resolveAuthenticatedApplicationActor(
  request: Request,
  rawBody = "",
): GatewayActor | undefined {
  const credentials = loadCredentials();
  if (credentials.length === 0) {
    return undefined;
  }
  const bearerActor = resolveBearerToken(request, credentials);
  if (bearerActor) {
    return bearerActor;
  }
  return resolveSignedRequest(request, rawBody, credentials);
}