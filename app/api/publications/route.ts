import {
  actorFromRequest,
  gatewayErrorResponse,
  jsonResponse,
  readJsonBody,
  requestContextFromRequest,
} from "@/application/publication-gateway/http";
import { getPublicationGatewayService } from "@/application/publication-gateway/singleton";
import { withOperationalLog } from "@/observability/operational-log";

export async function POST(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    const body = await readJsonBody(request);
    const response = await withOperationalLog(
      {
        operation: "publication.create",
        correlationId: context.correlationId,
        requestId: context.requestId,
        application: actor?.originatingApplication,
      },
      () => getPublicationGatewayService().createDraft(body, actor, context),
      (result) => result.publication.id,
    );

    return jsonResponse(response, 201, context);
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}

export async function GET(request: Request) {
  const context = requestContextFromRequest(request);
  try {
    const actor = await actorFromRequest(request);
    return jsonResponse(
      await withOperationalLog(
        {
          operation: "publication.list",
          correlationId: context.correlationId,
          requestId: context.requestId,
          application: actor?.originatingApplication,
        },
        () => getPublicationGatewayService().list(actor),
      ),
      200,
      context,
    );
  } catch (error) {
    return gatewayErrorResponse(error, context);
  }
}