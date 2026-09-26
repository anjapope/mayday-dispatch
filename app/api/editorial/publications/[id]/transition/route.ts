import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { withOperationalLog } from "@/observability/operational-log";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const { id } = await params;
    const body = await readJsonBody(request);
    return jsonResponse(
      await withOperationalLog(
        {
          operation: "publication.lifecycle.transition",
          correlationId: context.correlationId,
          requestId: context.requestId,
          application: actor?.originatingApplication,
          publicationId: id,
        },
        () => getPublicationGatewayService().transition(id, body, actor, context),
      ),
      200,
      context,
    );
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}
