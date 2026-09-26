import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getEvidenceGatewayService } from "@/application/evidence-gateway/singleton";
import { withOperationalLog } from "@/observability/operational-log";

/**
 * Controlled Evidence Registry API. Registration is independent of
 * publication association: registering evidence here does not attach it
 * to any publication (see `docs/evidence-registry.md`). Association
 * remains `POST /api/publications/:id/evidence`.
 */
export async function POST(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const body = await readJsonBody(request);
    const evidence = await withOperationalLog(
      {
        operation: "evidence.register",
        correlationId: context.correlationId,
        requestId: context.requestId,
        application: actor?.originatingApplication,
      },
      () => getEvidenceGatewayService().register(actor, body as never, context),
      undefined,
      (result) => result.id,
    );

    return jsonResponse({ evidence, correlationId: context.correlationId }, 201, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}