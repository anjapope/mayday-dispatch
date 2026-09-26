import { NextResponse } from "next/server";
import { GatewayError } from "@/application/publication-gateway/errors";
import {
  actorFromRequest,
  gatewayErrorResponse,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { logOperationalEvent } from "@/observability/operational-log";
import {
  clearEditorialSessionCookie,
  createEditorialSession,
  editorialSessionCookie,
} from "@/security/editorial-session";

export const dynamic = "force-dynamic";

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function GET(request: Request) {
  try {
    const actor = await actorFromRequest(request);
    if (!actor) throw new GatewayError("UNAUTHORIZED", "A Dispatch account is required.");
    return NextResponse.json(
      { actor: { subjectId: actor.subjectId, roles: actor.roles } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return gatewayErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await actorFromRequest(request);
    if (
      !actor ||
      actor.roles.includes("external-application") ||
      !actor.roles.some((role) => ["editor", "publisher", "admin", "operator"].includes(role))
    ) {
      throw new GatewayError("UNAUTHORIZED", "A configured Dispatch editorial account is required.");
    }
    const response = NextResponse.json(
      { actor: { subjectId: actor.subjectId, roles: actor.roles } },
      { headers: { "cache-control": "no-store" } },
    );
    response.headers.set(
      "set-cookie",
      editorialSessionCookie(createEditorialSession(actor), secureCookie()),
    );
    logOperationalEvent(
      "authentication.succeeded",
      requestContextFromRequest(request),
      undefined,
      "success",
      actor.originatingApplication,
    );
    return response;
  } catch (error) {
    return gatewayErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await actorFromRequest(request);
    const response = NextResponse.json({ signedOut: true }, {
      headers: { "cache-control": "no-store" },
    });
    response.headers.set("set-cookie", clearEditorialSessionCookie(secureCookie()));
    return response;
  } catch (error) {
    return gatewayErrorResponse(error);
  }
}
