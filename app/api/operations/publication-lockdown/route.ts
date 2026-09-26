import { NextResponse } from "next/server";
import { z } from "zod";
import { GatewayError } from "@/application/publication-gateway/errors";
import {
  actorFromRequest,
  gatewayErrorResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationRepository } from "@/publications/repository";
import { withOperationalLog } from "@/observability/operational-log";

export const dynamic = "force-dynamic";

function requireOperator(actor: Awaited<ReturnType<typeof actorFromRequest>>) {
  if (!actor?.roles.includes("operator")) {
    throw new GatewayError("FORBIDDEN", "A configured operations account is required.");
  }
  return actor;
}

export async function GET(request: Request) {
  try {
    requireOperator(await actorFromRequest(request));
    const control = await getPublicationRepository().getPublicationLockdown?.();
    if (!control) throw new GatewayError("PERSISTENCE_FAILURE", "Operational controls are unavailable.");
    return NextResponse.json({ publicationLockdown: control }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return gatewayErrorResponse(error, requestContextFromRequest(request));
  }
}

export async function PUT(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = requireOperator(await actorFromRequest(request));
    const body = await readJsonBody(request);
    const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(body);
    if (!parsed.success) {
      throw new GatewayError("VALIDATION_FAILED", "enabled must be a boolean.");
    }
    const enabled = parsed.data.enabled;
    const update = getPublicationRepository().setPublicationLockdown;
    if (!update) throw new GatewayError("PERSISTENCE_FAILURE", "Operational controls are unavailable.");
    const repository = getPublicationRepository();
    const publicationLockdown = await withOperationalLog(
      {
        operation: "publication.lockdown.change",
        correlationId: context.correlationId,
        requestId: context.requestId,
        application: actor.originatingApplication,
      },
      () => update.call(repository, enabled, actor, context, new Date().toISOString()),
    );
    return NextResponse.json({ publicationLockdown }, {
      headers: {
        "cache-control": "no-store",
        "x-request-id": context.requestId,
        "x-correlation-id": context.correlationId,
      },
    });
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
