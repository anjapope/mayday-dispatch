import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { withOperationalLog } from "@/observability/operational-log";

type PublicationRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: PublicationRouteContext) {
  const context = requestContextFromRequest(request);
  try {
    const { id } = await params;
    const actor = await actorFromRequest(request);
    const body = await readJsonBody(request);

    return jsonResponse(
      await withOperationalLog(
        {
          operation: "publication.evidence.attach",
          correlationId: context.correlationId,
          requestId: context.requestId,
          application: actor?.originatingApplication,
          publicationId: id,
        },
        () => getPublicationGatewayService().attachEvidence(id, body, actor, context),
      ),
      201,
      context,
    );
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}