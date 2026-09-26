import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
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
        evidenceId: id,
      },
      () => getEvidenceGatewayService().retrieve(actor, id),
    );

    return jsonResponse({ evidence, correlationId: context.correlationId }, 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const { id } = await params;
    const body = await readJsonBody(request);
    const evidence = await withOperationalLog(
      {
        operation: "evidence.update",
        correlationId: context.correlationId,
        requestId: context.requestId,
        application: actor?.originatingApplication,
        evidenceId: id,
      },
      () => getEvidenceGatewayService().update(id, actor, body as never, context),
    );
    return jsonResponse({ evidence, correlationId: context.correlationId }, 200, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}