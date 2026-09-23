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

export async function GET(request: Request, { params }: PublicationRouteContext) {
  const context = requestContextFromRequest(request);
  try {
    const { id } = await params;
    const actor = await actorFromRequest(request);

    return jsonResponse(
      await withOperationalLog(
        {
          operation: "publication.retrieve",
          correlationId: context.correlationId,
          requestId: context.requestId,
          application: actor?.originatingApplication,
          publicationId: id,
        },
        () => getPublicationGatewayService().getPublication(id, actor, context),
      ),
      200,
      context,
    );
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}

export async function PATCH(request: Request, { params }: PublicationRouteContext) {
  const context = requestContextFromRequest(request);
  try {
    const { id } = await params;
    const actor = await actorFromRequest(request);
    const body = await readJsonBody(request);

    return jsonResponse(
      await withOperationalLog(
        {
          operation: "publication.update",
          correlationId: context.correlationId,
          requestId: context.requestId,
          application: actor?.originatingApplication,
          publicationId: id,
        },
        () => getPublicationGatewayService().update(id, body, actor, context),
      ),
      200,
      context,
    );
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}