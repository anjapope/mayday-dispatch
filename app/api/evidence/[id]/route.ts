import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getEvidenceGatewayService } from "@/application/evidence-gateway/singleton";
import { withOperationalLog } from "@/observability/operational-log";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const { id } = await params;
    const evidence = await withOperationalLog(
      {
        operation: "evidence.retrieve",
        correlationId: context.correlationId,
        requestId: context.requestId,
        application: actor?.originatingApplication,
      },
      () => getEvidenceGatewayService().retrieve(actor, id, context),
    );

    return jsonResponse({ evidence, correlationId: context.correlationId }, 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}